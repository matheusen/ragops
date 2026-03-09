from __future__ import annotations

import copy
import pickle
import random
from collections import defaultdict
from pathlib import Path
from threading import Lock, RLock
from typing import Any, AsyncIterator, Iterator, Sequence
from uuid import uuid4

from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointTuple
from langgraph.checkpoint.memory import WRITES_IDX_MAP, get_checkpoint_id, get_checkpoint_metadata


def _checkpoint_namespace_store() -> defaultdict[str, dict[str, tuple[tuple[str, bytes], tuple[str, bytes], str | None]]]:
    return defaultdict(dict)


def _thread_store() -> defaultdict[
    str,
    dict[str, dict[str, tuple[tuple[str, bytes], tuple[str, bytes], str | None]]],
]:
    return defaultdict(_checkpoint_namespace_store)


_LOCK_REGISTRY: dict[str, RLock] = {}
_LOCK_REGISTRY_GUARD = Lock()


def _path_lock(path: Path) -> RLock:
    key = str(path.resolve())
    with _LOCK_REGISTRY_GUARD:
        lock = _LOCK_REGISTRY.get(key)
        if lock is None:
            lock = RLock()
            _LOCK_REGISTRY[key] = lock
        return lock


class PersistentFileSaver(BaseCheckpointSaver[str]):
    """Durable local checkpointer for LangGraph threads.

    This is a pragmatic file-backed fallback for environments where the official
    sqlite/postgres saver packages are not installed.
    """

    def __init__(self, path: str | Path) -> None:
        super().__init__()
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = _path_lock(self.path)
        self.storage: defaultdict[
            str,
            dict[str, dict[str, tuple[tuple[str, bytes], tuple[str, bytes], str | None]]],
        ] = _thread_store()
        self.writes: defaultdict[
            tuple[str, str, str],
            dict[tuple[str, int], tuple[str, str, tuple[str, bytes], str]],
        ] = defaultdict(dict)
        self.blobs: dict[tuple[str, str, str, str | int | float], tuple[str, bytes]] = {}
        self._load()

    def with_allowlist(self, allowlist: set[tuple[str, str]]) -> "PersistentFileSaver":
        """Keep compatibility with LangGraph serde variants that expose allowlists."""
        serde = getattr(self, "serde", None)
        configure = getattr(serde, "with_allowlist", None)
        if callable(configure):
            configured = configure(allowlist)
            if configured is not None:
                self.serde = configured
        return self

    def _load(self) -> None:
        if not self.path.exists():
            return
        with self._lock:
            try:
                with self.path.open("rb") as fh:
                    payload = pickle.load(fh)
            except (EOFError, pickle.UnpicklingError):
                self.storage = _thread_store()
                self.writes = defaultdict(dict)
                self.blobs = {}
                return
            self.storage = payload.get("storage", _thread_store())
            self.writes = payload.get("writes", defaultdict(dict))
            self.blobs = payload.get("blobs", {})

    def _persist(self) -> None:
        payload = {
            "storage": self.storage,
            "writes": self.writes,
            "blobs": self.blobs,
        }
        with self._lock:
            temp_path = self.path.with_suffix(self.path.suffix + f".{uuid4().hex}.tmp")
            with temp_path.open("wb") as fh:
                pickle.dump(payload, fh, protocol=pickle.HIGHEST_PROTOCOL)
            temp_path.replace(self.path)

    def _load_blobs(self, thread_id: str, checkpoint_ns: str, versions: dict[str, Any]) -> dict[str, Any]:
        channel_values: dict[str, Any] = {}
        for channel, version in versions.items():
            blob_key = (thread_id, checkpoint_ns, channel, version)
            if blob_key not in self.blobs:
                continue
            typed_value = self.blobs[blob_key]
            if typed_value[0] != "empty":
                channel_values[channel] = self.serde.loads_typed(typed_value)
        return channel_values

    def _hydrate_checkpoint(
        self,
        checkpoint_value: Checkpoint,
        *,
        thread_id: str,
        checkpoint_ns: str,
    ) -> Checkpoint:
        hydrated = dict(checkpoint_value)
        hydrated.setdefault("pending_sends", [])
        hydrated["channel_values"] = self._load_blobs(
            thread_id,
            checkpoint_ns,
            hydrated.get("channel_versions", {}),
        )
        return hydrated

    def get_tuple(self, config: dict[str, Any]) -> CheckpointTuple | None:
        thread_id: str = config["configurable"]["thread_id"]
        checkpoint_ns: str = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = get_checkpoint_id(config)
        with self._lock:
            if checkpoint_id:
                saved = self.storage.get(thread_id, {}).get(checkpoint_ns, {}).get(checkpoint_id)
                if not saved:
                    return None
            else:
                checkpoints = self.storage.get(thread_id, {}).get(checkpoint_ns, {})
                if not checkpoints:
                    return None
                checkpoint_id = max(checkpoints.keys())
                saved = checkpoints[checkpoint_id]
            checkpoint, metadata, parent_checkpoint_id = saved
            writes = self.writes.get((thread_id, checkpoint_ns, checkpoint_id), {}).values()
            checkpoint_value: Checkpoint = self.serde.loads_typed(checkpoint)
            return CheckpointTuple(
                config={
                    "configurable": {
                        "thread_id": thread_id,
                        "checkpoint_ns": checkpoint_ns,
                        "checkpoint_id": checkpoint_id,
                    }
                },
                checkpoint=self._hydrate_checkpoint(
                    checkpoint_value,
                    thread_id=thread_id,
                    checkpoint_ns=checkpoint_ns,
                ),
                metadata=self.serde.loads_typed(metadata),
                parent_config=(
                    {
                        "configurable": {
                            "thread_id": thread_id,
                            "checkpoint_ns": checkpoint_ns,
                            "checkpoint_id": parent_checkpoint_id,
                        }
                    }
                    if parent_checkpoint_id
                    else None
                ),
                pending_writes=[
                    (task_id, channel, self.serde.loads_typed(value))
                    for task_id, channel, value, _ in writes
                ],
            )

    def list(
        self,
        config: dict[str, Any] | None,
        *,
        filter: dict[str, Any] | None = None,
        before: dict[str, Any] | None = None,
        limit: int | None = None,
    ) -> Iterator[CheckpointTuple]:
        thread_ids = (config["configurable"]["thread_id"],) if config else tuple(self.storage.keys())
        config_checkpoint_ns = config["configurable"].get("checkpoint_ns") if config else None
        config_checkpoint_id = get_checkpoint_id(config) if config else None

        with self._lock:
            for thread_id in thread_ids:
                for checkpoint_ns in self.storage.get(thread_id, {}).keys():
                    if config_checkpoint_ns is not None and checkpoint_ns != config_checkpoint_ns:
                        continue
                    items = sorted(
                        self.storage[thread_id][checkpoint_ns].items(),
                        key=lambda item: item[0],
                        reverse=True,
                    )
                    for checkpoint_id, (checkpoint, metadata_bytes, parent_checkpoint_id) in items:
                        if config_checkpoint_id and checkpoint_id != config_checkpoint_id:
                            continue
                        if before and (before_id := get_checkpoint_id(before)) and checkpoint_id >= before_id:
                            continue
                        metadata = self.serde.loads_typed(metadata_bytes)
                        if filter and not all(metadata.get(key) == value for key, value in filter.items()):
                            continue
                        if limit is not None and limit <= 0:
                            return
                        if limit is not None:
                            limit -= 1
                        checkpoint_value: Checkpoint = self.serde.loads_typed(checkpoint)
                        writes = self.writes.get((thread_id, checkpoint_ns, checkpoint_id), {}).values()
                        yield CheckpointTuple(
                            config={
                                "configurable": {
                                    "thread_id": thread_id,
                                    "checkpoint_ns": checkpoint_ns,
                                    "checkpoint_id": checkpoint_id,
                                }
                            },
                            checkpoint=self._hydrate_checkpoint(
                                checkpoint_value,
                                thread_id=thread_id,
                                checkpoint_ns=checkpoint_ns,
                            ),
                            metadata=metadata,
                            parent_config=(
                                {
                                    "configurable": {
                                        "thread_id": thread_id,
                                        "checkpoint_ns": checkpoint_ns,
                                        "checkpoint_id": parent_checkpoint_id,
                                    }
                                }
                                if parent_checkpoint_id
                                else None
                            ),
                            pending_writes=[
                                (task_id, channel, self.serde.loads_typed(value))
                                for task_id, channel, value, _ in writes
                            ],
                        )

    def put(
        self,
        config: dict[str, Any],
        checkpoint: Checkpoint,
        metadata: dict[str, Any],
        new_versions: dict[str, Any],
    ) -> dict[str, Any]:
        checkpoint_copy = checkpoint.copy()
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        channel_values: dict[str, Any] = checkpoint_copy.pop("channel_values")
        with self._lock:
            for channel, version in new_versions.items():
                self.blobs[(thread_id, checkpoint_ns, channel, version)] = (
                    self.serde.dumps_typed(channel_values[channel])
                    if channel in channel_values
                    else ("empty", b"")
                )
            self.storage[thread_id][checkpoint_ns][checkpoint["id"]] = (
                self.serde.dumps_typed(checkpoint_copy),
                self.serde.dumps_typed(get_checkpoint_metadata(config, metadata)),
                config["configurable"].get("checkpoint_id"),
            )
            self._persist()
        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint["id"],
            }
        }

    def put_writes(
        self,
        config: dict[str, Any],
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"]["checkpoint_id"]
        outer_key = (thread_id, checkpoint_ns, checkpoint_id)
        with self._lock:
            outer_writes = self.writes.get(outer_key)
            for idx, (channel, value) in enumerate(writes):
                inner_key = (task_id, WRITES_IDX_MAP.get(channel, idx))
                if inner_key[1] >= 0 and outer_writes and inner_key in outer_writes:
                    continue
                self.writes[outer_key][inner_key] = (
                    task_id,
                    channel,
                    self.serde.dumps_typed(value),
                    task_path,
                )
            self._persist()

    def delete_thread(self, thread_id: str) -> None:
        with self._lock:
            self.storage.pop(thread_id, None)
            for key in list(self.writes.keys()):
                if key[0] == thread_id:
                    del self.writes[key]
            for key in list(self.blobs.keys()):
                if key[0] == thread_id:
                    del self.blobs[key]
            self._persist()

    def delete_for_runs(self, run_ids: Sequence[str]) -> None:
        if not run_ids:
            return

    def copy_thread(self, source_thread_id: str, target_thread_id: str) -> None:
        with self._lock:
            if source_thread_id not in self.storage:
                return
            self.storage[target_thread_id] = copy.deepcopy(self.storage[source_thread_id])
            for key, value in list(self.writes.items()):
                if key[0] == source_thread_id:
                    self.writes[(target_thread_id, key[1], key[2])] = copy.deepcopy(value)
            for key, value in list(self.blobs.items()):
                if key[0] == source_thread_id:
                    self.blobs[(target_thread_id, key[1], key[2], key[3])] = copy.deepcopy(value)
            self._persist()

    def prune(self, thread_ids: Sequence[str], *, strategy: str = "keep_latest") -> None:
        if strategy == "delete":
            for thread_id in thread_ids:
                self.delete_thread(thread_id)
            return
        with self._lock:
            for thread_id in thread_ids:
                namespaces = self.storage.get(thread_id, {})
                for checkpoint_ns, checkpoints in namespaces.items():
                    if len(checkpoints) <= 1:
                        continue
                    latest_id = max(checkpoints.keys())
                    self.storage[thread_id][checkpoint_ns] = {latest_id: checkpoints[latest_id]}
            self._persist()

    async def aget_tuple(self, config: dict[str, Any]) -> CheckpointTuple | None:
        return self.get_tuple(config)

    async def alist(
        self,
        config: dict[str, Any] | None,
        *,
        filter: dict[str, Any] | None = None,
        before: dict[str, Any] | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[CheckpointTuple]:
        for item in self.list(config, filter=filter, before=before, limit=limit):
            yield item

    async def aput(
        self,
        config: dict[str, Any],
        checkpoint: Checkpoint,
        metadata: dict[str, Any],
        new_versions: dict[str, Any],
    ) -> dict[str, Any]:
        return self.put(config, checkpoint, metadata, new_versions)

    async def aput_writes(
        self,
        config: dict[str, Any],
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        self.put_writes(config, writes, task_id, task_path)

    async def adelete_thread(self, thread_id: str) -> None:
        self.delete_thread(thread_id)

    async def adelete_for_runs(self, run_ids: Sequence[str]) -> None:
        self.delete_for_runs(run_ids)

    async def acopy_thread(self, source_thread_id: str, target_thread_id: str) -> None:
        self.copy_thread(source_thread_id, target_thread_id)

    async def aprune(self, thread_ids: Sequence[str], *, strategy: str = "keep_latest") -> None:
        self.prune(thread_ids, strategy=strategy)

    def get_next_version(self, current: str | None, channel: None) -> str:
        if current is None:
            current_version = 0
        elif isinstance(current, int):
            current_version = current
        else:
            current_version = int(str(current).split(".")[0])
        next_version = current_version + 1
        return f"{next_version:032}.{random.random():016}"
