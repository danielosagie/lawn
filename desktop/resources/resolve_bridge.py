#!/usr/bin/env python3
"""
lawn Resolve bridge — single Python entrypoint the desktop app shells out
to. Talks to a *running* DaVinci Resolve via the official scripting API
from outside Resolve, exports / imports FCPXML, returns JSON on stdout.

Subcommands:

    status          → JSON describing the current Resolve project + timeline
    export <out>    → exports the active timeline to FCPXML 1.10 at <out>
    import <fcpxml> → imports <fcpxml> into the current Resolve project as
                      a new timeline

Every invocation prints exactly one JSON document to stdout, even on
failure, so the Electron side has a uniform `{ok: bool, ...}` shape to
parse. Errors are categorized so the UI can guide the user:

    not_running       — Resolve isn't open. Open it.
    api_unavailable   — Scripting API not on sys.path; user needs to set
                        RESOLVE_SCRIPT_API/LIB or install Resolve Studio.
    scripting_off     — Resolve is running but external scripting is
                        disabled in Preferences → System → General.
    no_project        — No Resolve project open.
    no_timeline       — Project open, but no active timeline.
"""

from __future__ import annotations

import json
import os
import platform
import sys
from pathlib import Path
from typing import Any, Dict, Optional


# ─── Default API paths so the bridge "just works" on a stock Resolve install ─

def _default_api_paths() -> Dict[str, str]:
    system = platform.system()
    if system == "Darwin":
        return {
            "api": "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting",
            "lib": "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so",
            "modules": "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules",
        }
    if system == "Windows":
        program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
        program_files = os.environ.get("PROGRAMFILES", r"C:\Program Files")
        return {
            "api": rf"{program_data}\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting",
            "lib": rf"{program_files}\Blackmagic Design\DaVinci Resolve\fusionscript.dll",
            "modules": rf"{program_data}\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
        }
    # Linux
    return {
        "api": "/opt/resolve/Developer/Scripting",
        "lib": "/opt/resolve/libs/Fusion/fusionscript.so",
        "modules": "/opt/resolve/Developer/Scripting/Modules",
    }


def _ensure_paths() -> None:
    """Set RESOLVE_SCRIPT_* env vars + sys.path so `import
    DaVinciResolveScript` works when this script runs from outside
    Resolve."""
    defaults = _default_api_paths()
    os.environ.setdefault("RESOLVE_SCRIPT_API", defaults["api"])
    os.environ.setdefault("RESOLVE_SCRIPT_LIB", defaults["lib"])
    modules = os.environ.get("RESOLVE_SCRIPT_MODULES") or defaults["modules"]
    if modules and modules not in sys.path:
        sys.path.insert(0, modules)


def _result(**kwargs: Any) -> None:
    print(json.dumps(kwargs), flush=True)


def _fail(category: str, message: str, **extra: Any) -> None:
    _result(ok=False, error=category, message=message, **extra)


def _get_resolve():
    """Returns Resolve scriptapp or prints categorized error JSON and
    raises SystemExit. We swallow ImportError vs. None vs. socket errors
    separately because each maps to a distinct user remediation."""
    _ensure_paths()
    try:
        import DaVinciResolveScript as bmd  # type: ignore  # noqa: I001
    except ImportError:
        _fail(
            "api_unavailable",
            "Couldn't find DaVinciResolveScript. Install DaVinci Resolve "
            "Studio (the free version blocks external scripting) and "
            "verify the API path. Defaults assumed for this OS: "
            f"{_default_api_paths()['api']}",
        )
        raise SystemExit(1)

    try:
        resolve = bmd.scriptapp("Resolve")
    except Exception as e:  # pragma: no cover — depends on Resolve internals
        _fail(
            "not_running",
            f"DaVinci Resolve isn't responding. Is it open? ({e})",
        )
        raise SystemExit(1)

    if resolve is None:
        _fail(
            "not_running",
            "DaVinci Resolve isn't running. Open Resolve, then retry.",
        )
        raise SystemExit(1)
    return resolve


# ─── Subcommands ─────────────────────────────────────────────────────────────

def cmd_status() -> int:
    resolve = _get_resolve()
    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject() if pm else None
    timeline = project.GetCurrentTimeline() if project else None

    _result(
        ok=True,
        project_name=project.GetName() if project else None,
        project_id=project.GetUniqueId() if project and hasattr(project, "GetUniqueId") else None,
        timeline_name=timeline.GetName() if timeline else None,
        timeline_id=
            timeline.GetUniqueId() if timeline and hasattr(timeline, "GetUniqueId") else None,
        timeline_count=project.GetTimelineCount() if project else 0,
        resolve_product=resolve.GetProductName() if hasattr(resolve, "GetProductName") else None,
        resolve_version=resolve.GetVersionString() if hasattr(resolve, "GetVersionString") else None,
    )
    return 0


def cmd_export(out_path: Path) -> int:
    resolve = _get_resolve()
    project = resolve.GetProjectManager().GetCurrentProject()
    if project is None:
        _fail("no_project", "No Resolve project is open.")
        return 1
    timeline = project.GetCurrentTimeline()
    if timeline is None:
        _fail("no_timeline", "Project is open but no timeline is active.")
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    # 9 = EXPORT_FCPXML_1_10 in Resolve's exportType enum. Hardcoded so we
    # don't need to read it off the resolve object (which sometimes fails
    # to expose enum attributes via the external connection).
    ok = project.ExportCurrentTimelineToFile(str(out_path), 9)
    if not ok or not out_path.exists():
        _fail(
            "export_failed",
            f"Resolve refused to export to {out_path}. Check disk perms or "
            f"that the timeline isn't empty.",
        )
        return 1

    _result(
        ok=True,
        path=str(out_path),
        size_bytes=out_path.stat().st_size,
        timeline_name=timeline.GetName(),
        timeline_id=timeline.GetUniqueId() if hasattr(timeline, "GetUniqueId") else None,
        project_name=project.GetName(),
        project_id=project.GetUniqueId() if hasattr(project, "GetUniqueId") else None,
    )
    return 0


def cmd_import(fcpxml_path: Path) -> int:
    resolve = _get_resolve()
    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject()
    if project is None:
        _fail("no_project", "Open a Resolve project to import into.")
        return 1
    if not fcpxml_path.exists():
        _fail("export_failed", f"FCPXML file not found: {fcpxml_path}")
        return 1

    # `ImportTimelineFromFile` returns the imported Timeline object on
    # success (Resolve >= 18.x). On older builds the return is a bool.
    new_timeline = pm.ImportTimelineFromFile(str(fcpxml_path))
    if not new_timeline:
        _fail(
            "import_failed",
            "Resolve rejected the import. Most common cause: missing media "
            "for clips referenced in the FCPXML. Make sure the media files "
            "are available in the bin first.",
        )
        return 1

    name = (
        new_timeline.GetName()
        if hasattr(new_timeline, "GetName")
        else fcpxml_path.stem
    )
    _result(
        ok=True,
        imported_as=name,
        timeline_id=
            new_timeline.GetUniqueId() if hasattr(new_timeline, "GetUniqueId") else None,
    )
    return 0


# ─── Entry point ─────────────────────────────────────────────────────────────

def main(argv: Optional[list[str]] = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        _fail("usage", "Subcommand required: status | export <path> | import <path>")
        return 2

    cmd = args[0]
    try:
        if cmd == "status":
            return cmd_status()
        if cmd == "export":
            if len(args) < 2:
                _fail("usage", "export requires an output path argument")
                return 2
            return cmd_export(Path(args[1]))
        if cmd == "import":
            if len(args) < 2:
                _fail("usage", "import requires an FCPXML path argument")
                return 2
            return cmd_import(Path(args[1]))
        _fail("usage", f"Unknown subcommand: {cmd}")
        return 2
    except SystemExit:
        return 1
    except Exception as e:
        _fail("internal", f"{type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
