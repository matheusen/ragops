"""
migrate_roadmaps.py
-------------------
Migra a collection `roadmaps` do MongoDB do Windows (127.0.0.1:27017)
para o MongoDB do Docker (container ragops-mongodb).

Estratégia:
  1. Lê todos os documentos do Windows MongoDB via pymongo
  2. Serializa para JSON com bson.json_util (preserva ObjectId, datetime, etc.)
  3. Copia o JSON para dentro do container via `docker cp`
  4. Executa `mongoimport` dentro do container com --upsertFields _id

Uso:
  python scripts/migrate_roadmaps.py [--dry-run]
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from bson import json_util
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure
except ImportError:
    print("ERRO: pymongo não encontrado. Ative o venv: .venv\\Scripts\\activate")
    sys.exit(1)

WIN_URI    = "mongodb://127.0.0.1:27017"
CONTAINER  = "ragops-mongodb"
DB_NAME    = "ragflow"
COLLECTION = "roadmaps"


def connect(uri: str, label: str) -> MongoClient:
    client = MongoClient(uri, serverSelectionTimeoutMS=4000)
    try:
        client.admin.command("ping")
        print(f"  ✓ {label} conectado ({uri})")
        return client
    except ConnectionFailure as e:
        print(f"  ✗ {label} inacessível: {e}")
        sys.exit(1)


def docker_exec(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "exec", CONTAINER, *args],
        capture_output=True, text=True
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Apenas lista os documentos, não migra")
    args = parser.parse_args()

    print("\n── Migração de roadmaps: Windows → Docker ─────────────────")

    # ── 1. Verifica container ────────────────────────────────────────────────
    result = subprocess.run(
        ["docker", "inspect", "--format", "{{.State.Running}}", CONTAINER],
        capture_output=True, text=True
    )
    if result.stdout.strip() != "true":
        print(f"ERRO: container '{CONTAINER}' não está rodando.")
        print("  Execute: docker compose up mongodb -d")
        sys.exit(1)
    print(f"  ✓ Container {CONTAINER} está rodando")

    # ── 2. Lê do Windows MongoDB ─────────────────────────────────────────────
    win_client = connect(WIN_URI, "Windows MongoDB")
    win_col    = win_client[DB_NAME][COLLECTION]
    docs       = list(win_col.find({}))

    if not docs:
        print(f"\nNenhum documento encontrado em {DB_NAME}.{COLLECTION} no Windows MongoDB.")
        win_client.close()
        sys.exit(0)

    print(f"\n  Documentos encontrados: {len(docs)}")
    for doc in docs:
        title = doc.get("title") or doc.get("goal") or str(doc.get("_id", ""))
        created = doc.get("created_at", "—")
        print(f"    • {title[:60]}  ({created[:10] if created else '—'})")

    if args.dry_run:
        print("\n[dry-run] Nenhuma alteração feita.")
        win_client.close()
        return

    # ── 3. Serializa para JSON com suporte a ObjectId/datetime ───────────────
    json_str = json_util.dumps(docs, indent=2)

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(json_str)
        tmp_path = Path(tmp.name)

    print(f"\n  JSON temporário: {tmp_path}")

    # ── 4. Copia para dentro do container ────────────────────────────────────
    cp_result = subprocess.run(
        ["docker", "cp", str(tmp_path), f"{CONTAINER}:/tmp/roadmaps_migration.json"],
        capture_output=True, text=True
    )
    if cp_result.returncode != 0:
        print(f"ERRO ao copiar arquivo para o container: {cp_result.stderr}")
        tmp_path.unlink(missing_ok=True)
        sys.exit(1)
    print("  ✓ Arquivo copiado para o container")

    # ── 5. Verifica quantos já existem no Docker MongoDB ─────────────────────
    count_before = docker_exec(
        "mongosh", "--quiet", "--eval",
        f"db.getSiblingDB('{DB_NAME}').{COLLECTION}.countDocuments()"
    )
    before = count_before.stdout.strip()
    print(f"  Docker MongoDB — documentos antes: {before}")

    # ── 6. Executa mongoimport dentro do container ───────────────────────────
    import_result = docker_exec(
        "mongoimport",
        "--db",         DB_NAME,
        "--collection", COLLECTION,
        "--file",       "/tmp/roadmaps_migration.json",
        "--jsonArray",
        "--upsert",
        "--upsertFields", "_id",
    )
    if import_result.returncode != 0:
        print(f"ERRO no mongoimport:\n{import_result.stderr}")
        tmp_path.unlink(missing_ok=True)
        sys.exit(1)

    print(f"  ✓ mongoimport concluído:\n    {import_result.stdout.strip()}")

    # ── 7. Confirma contagem final ───────────────────────────────────────────
    count_after = docker_exec(
        "mongosh", "--quiet", "--eval",
        f"db.getSiblingDB('{DB_NAME}').{COLLECTION}.countDocuments()"
    )
    after = count_after.stdout.strip()
    print(f"  Docker MongoDB — documentos depois: {after}")

    # ── 8. Limpeza ───────────────────────────────────────────────────────────
    tmp_path.unlink(missing_ok=True)
    docker_exec("rm", "/tmp/roadmaps_migration.json")
    win_client.close()

    print(f"\n✅ Migração concluída! {len(docs)} roadmap(s) migrado(s).")
    print("\nPróximos passos:")
    print("  1. Verifique no Compass (Docker: 127.0.0.1:27017 enquanto Windows estiver parado)")
    print("  2. Adicione MONGODB_URI=mongodb://localhost:27017 ao .env")
    print("  3. Desative o MongoDB do Windows:")
    print("       powershell -Command \"Stop-Service MongoDB; Set-Service MongoDB -StartupType Disabled\"")


if __name__ == "__main__":
    main()
