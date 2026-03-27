#!/usr/bin/env python3
from __future__ import annotations

import sys

from scraper import main


if __name__ == "__main__":
    if "--mode" not in sys.argv:
        sys.argv.extend(["--mode", "producer"])
    main()
