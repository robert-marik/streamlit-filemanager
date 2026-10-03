"""Streamlit wrapper: registers the CCv2 component and dispatches client actions."""

from __future__ import annotations

import base64
import binascii
import logging
from pathlib import Path
from collections.abc import Callable, Mapping
from typing import Any

import streamlit as st

from .backend import FileManager, FileManagerError, parse_size
from .i18n import Message, resolve_messages

_log = logging.getLogger(__name__)
_FRONTEND = Path(__file__).parent / "frontend"
_component = None


def _get_component():
    global _component
    if _component is None:
        _component = st.components.v2.component(
            "st_filemanager.file_manager",
            html=(_FRONTEND / "filemanager.html").read_text(encoding="utf-8"),
            css=(_FRONTEND / "filemanager.css").read_text(encoding="utf-8"),
            js=(_FRONTEND / "filemanager.js").read_text(encoding="utf-8"),
        )
    return _component


def _state(key: str) -> dict:
    return st.session_state.setdefault(
        f"_st_filemanager_{key}", {"cwd": "", "flash": None, "result": None, "ack": None}
    )


def _read_action(key: str) -> Any:
    value = st.session_state.get(key)
    if value is None:
        return None
    try:
        return value["action"]
    except (KeyError, TypeError):
        return getattr(value, "action", None)


def _handle(fm: FileManager, state: dict, action: dict, read_only: bool) -> None:
    op = action.get("op")
    cwd = state["cwd"]
    flash: dict[str, Any] = {"id": action.get("id")}
    result: dict[str, Any] = {"op": op, "ok": True}
    mutating = {"mkdir", "rename", "delete", "move", "copy", "upload", "save", "newfile"}
    try:
        if op in mutating and read_only:
            raise FileManagerError("read_only")
        if op == "cd":
            target = fm.resolve(action.get("path", ""))
            if not target.is_dir():
                raise FileManagerError("not_a_dir", name=action.get("path", ""))
            state["cwd"] = fm.rel(target)
        elif op == "refresh":
            pass
        elif op == "mkdir":
            result["path"] = fm.mkdir(cwd, action["name"])
            flash["select"] = [Path(result["path"]).name]
            flash["notice"] = {"type": "success", "code": "created", "params": {"name": action["name"]}}
        elif op == "newfile":
            result["path"] = fm.create_file(cwd, action["name"], action.get("text", ""))
            flash["select"] = [Path(result["path"]).name]
            flash["notice"] = {"type": "success", "code": "fileCreated", "params": {"name": action["name"]}}
        elif op == "rename":
            result["path"] = fm.rename(action["path"], action["name"])
            result["from"] = action["path"]
            flash["select"] = [Path(result["path"]).name]
        elif op == "delete":
            n = fm.delete(action["paths"])
            result["paths"] = action["paths"]
            flash["notice"] = {"type": "success", "code": "deleted", "params": {"n": n}}
        elif op in ("move", "copy"):
            dest = action.get("dest", cwd)
            n = (fm.move if op == "move" else fm.copy)(action["paths"], dest)
            result.update(paths=action["paths"], dest=dest)
            flash["notice"] = {"type": "success", "code": "moved" if op == "move" else "copied", "params": {"n": n}}
        elif op == "upload":
            files = []
            for f in action.get("files", []):
                try:
                    files.append((f["name"], base64.b64decode(f["b64"], validate=True)))
                except (binascii.Error, KeyError, TypeError):
                    raise FileManagerError("upload_failed", name=f.get("name", "?")) from None
            names = fm.upload(action.get("dir", cwd), files, overwrite=bool(action.get("overwrite")))
            result["paths"] = names
            flash["select"] = list(dict.fromkeys(n.split("/")[0] for n in names))
            flash["notice"] = {"type": "success", "code": "uploaded", "params": {"n": len(names)}}
        elif op == "download":
            name, mime, content = fm.download(action["paths"])
            flash["download"] = {"name": name, "mime": mime, "b64": base64.b64encode(content).decode()}
            result["paths"] = action["paths"]
        elif op == "preview":
            flash["preview"] = fm.preview(action["path"])
            result["path"] = action["path"]
        elif op == "save":
            fm.save_text(action["path"], action["text"], action.get("mtime"))
            result["path"] = action["path"]
            flash["preview"] = fm.preview(action["path"])
            flash["notice"] = {"type": "success", "code": "saved", "params": {"name": Path(action["path"]).name}}
        else:
            raise FileManagerError("unknown_op", op=op)
    except FileManagerError as e:
        result.update(ok=False, error=e.code, params=e.params)
        flash["notice"] = {"type": "error", "code": e.code, "params": e.params}
    except OSError as e:
        _log.exception("file manager operation %s failed", op)
        result.update(ok=False, error="os_error", params={"msg": e.strerror or str(e)})
        flash["notice"] = {"type": "error", "code": "os_error", "params": {"msg": e.strerror or str(e)}}
    state["flash"] = flash
    state["ack"] = action.get("id")
    state["result"] = result


def file_manager(
    root: str | Path,
    quota: int | str | None = None,
    *,
    key: str = "file_manager",
    height: int = 520,
    read_only: bool = False,
    show_hidden: bool = False,
    max_upload_size: int | str | None = "100MB",
    allowed_extensions: list[str] | None = None,
    lang: str | None = None,
    translations: Mapping[str, Message] | None = None,
    usage: Callable[[], int] | None = None,
) -> dict | None:
    """Render a file manager confined to ``root``.

    Parameters
    ----------
    root : directory the user may manage (created if missing).
    quota : max total size of ``root`` (or of what ``usage`` counts) in bytes or as "500MB"/"2GB"; None = unlimited.
    key : unique widget key (use different keys for several instances).
    height : component height in pixels.
    read_only : disable upload / rename / delete / mkdir / new file / move / copy / edit.
    show_hidden : list dot-files.
    max_upload_size : per-file upload limit. Uploads travel over the Streamlit
        websocket as base64, so keep this below ``server.maxMessageSize`` / 1.4.
    allowed_extensions : e.g. ["pdf", "png"] to restrict uploads; None = anything.
    lang : UI language as a BCP 47 tag ("en", "cs", "de-AT", ...). None (default)
        uses the browser locale (``st.context.locale``). Falls back to English
        when no translation is available; see ``available_languages()``.
    translations : per-instance message overrides, e.g. ``{"upload": "Add files"}``.
        Keys are listed by ``message_keys()``.
    usage : callable returning the bytes counted against ``quota``; defaults to
        the size of ``root``. Use it when ``root`` is only part of the user's
        storage, e.g. ``usage=lambda: tree_size("/data/user1")``.

    Returns
    -------
    dict | None
        Description of the operation performed in this run, e.g.
        ``{"op": "upload", "ok": True, "paths": ["a.txt"]}``, or None.
    """
    fm = FileManager(
        root=Path(root),
        quota=parse_size(quota),
        show_hidden=show_hidden,
        max_upload_size=parse_size(max_upload_size),
        allowed_extensions=frozenset(allowed_extensions) if allowed_extensions is not None else None,
        usage=usage,
    )
    state = _state(key)
    if lang is None:
        try:
            lang = st.context.locale
        except Exception:  # older Streamlit / no browser context
            lang = None
    locale, messages = resolve_messages(lang, translations)

    def on_action() -> None:
        action = _read_action(key)
        if isinstance(action, dict):
            _handle(fm, state, action, read_only)

    # The cwd may have vanished (deleted elsewhere) -> fall back to root.
    try:
        entries = fm.list_dir(state["cwd"])
    except FileManagerError:
        state["cwd"] = ""
        entries = fm.list_dir("")

    flash, state["flash"] = state["flash"], None  # one-shot payloads
    result, state["result"] = state["result"], None
    data = {
        "cwd": state["cwd"],
        "rootName": fm.root.name or "/",
        "entries": entries,
        "quota": {"used": fm.used_bytes(), "limit": fm.quota} if fm.quota is not None else None,
        "readOnly": read_only,
        "maxUpload": fm.max_upload_size,
        "allowedExt": sorted(fm.allowed_extensions) if fm.allowed_extensions is not None else None,
        "lang": locale,
        "i18n": messages,
        "height": height,
        "flash": flash,
        "ack": state["ack"],
    }
    _get_component()(key=key, data=data, height=height, on_action_change=on_action)
    return result
