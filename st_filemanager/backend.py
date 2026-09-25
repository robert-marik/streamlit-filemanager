"""Filesystem operations for the file manager, confined to a root directory.

Everything here is plain Python (no Streamlit) so it can be unit-tested.
All paths coming from the client are *relative* POSIX strings ("" = root).
"""

from __future__ import annotations

import base64
import io
import mimetypes
import os
import re
import shutil
import stat
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

PREVIEW_TEXT_LIMIT = 1024 * 1024  # 1 MB
PREVIEW_IMAGE_LIMIT = 10 * 1024 * 1024  # 10 MB

IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"}
TEXT_EXTS = {
    "txt", "md", "markdown", "rst", "log", "csv", "tsv", "json", "jsonl", "yaml",
    "yml", "toml", "ini", "cfg", "conf", "env", "xml", "html", "htm", "css",
    "scss", "less", "js", "mjs", "cjs", "ts", "tsx", "jsx", "vue", "py", "pyi",
    "ipynb", "r", "rb", "php", "java", "kt", "kts", "scala", "go", "rs", "c",
    "h", "cpp", "hpp", "cc", "cs", "swift", "m", "sh", "bash", "zsh", "fish",
    "ps1", "bat", "cmd", "sql", "tex", "bib", "lua", "pl", "dart", "dockerfile",
    "makefile", "gitignore", "properties", "srt", "vtt",
}
# Extension -> highlight.js language name (only where they differ / matter).
HLJS_LANG = {
    "py": "python", "pyi": "python", "js": "javascript", "mjs": "javascript",
    "cjs": "javascript", "jsx": "javascript", "ts": "typescript", "tsx": "typescript",
    "md": "markdown", "markdown": "markdown", "yml": "yaml", "yaml": "yaml",
    "htm": "xml", "html": "xml", "xml": "xml", "vue": "xml", "svg": "xml",
    "sh": "bash", "bash": "bash", "zsh": "bash", "rb": "ruby", "rs": "rust",
    "kt": "kotlin", "kts": "kotlin", "cs": "csharp", "h": "c", "hpp": "cpp",
    "cc": "cpp", "ps1": "powershell", "bat": "dos", "cmd": "dos", "tex": "latex",
    "ipynb": "json", "jsonl": "json", "cfg": "ini", "conf": "ini", "toml": "ini",
    "pl": "perl", "m": "objectivec", "dockerfile": "dockerfile",
    "makefile": "makefile", "txt": "plaintext", "log": "plaintext",
    "csv": "plaintext", "tsv": "plaintext",
}

_SIZE_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*([kmgt]?i?b?)?\s*$", re.IGNORECASE)
_UNITS = {"": 1, "b": 1, "k": 1024, "m": 1024**2, "g": 1024**3, "t": 1024**4}


class FileManagerError(Exception):
    """Error with a translatable message key and parameters for the frontend."""

    def __init__(self, code: str, **params: object) -> None:
        super().__init__(code, params)
        self.code = code
        self.params = {k: str(v) for k, v in params.items()}


def parse_size(value: int | float | str | None) -> int | None:
    """Parse 1024, "500MB", "1.5 GB", "10k" -> bytes (binary units)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    m = _SIZE_RE.match(value)
    if not m:
        raise ValueError(f"Invalid size: {value!r}")
    unit = (m.group(2) or "").lower()[:1]
    return int(float(m.group(1)) * _UNITS[unit])


def ext_of(name: str) -> str:
    lower = name.lower()
    if lower in ("dockerfile", "makefile"):
        return lower
    if lower.startswith(".") and lower.count(".") == 1:
        return lower[1:]
    return lower.rsplit(".", 1)[-1] if "." in lower else ""


@dataclass
class FileManager:
    root: Path
    quota: int | None = None
    show_hidden: bool = False
    max_upload_size: int | None = None
    allowed_extensions: frozenset[str] | None = None
    # Custom usage counter for the quota, e.g. when root is a subdirectory of
    # the user's storage: ``usage=lambda: tree_size("/data/user1")``.
    usage: Callable[[], int] | None = None

    def __post_init__(self) -> None:
        self.root = Path(self.root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        if self.allowed_extensions is not None:
            self.allowed_extensions = frozenset(
                e.lower().lstrip(".") for e in self.allowed_extensions
            )

    # ------------------------------------------------------------------ paths
    def resolve(self, rel: str) -> Path:
        """Map a client-supplied relative path to an absolute path inside root."""
        rel = (rel or "").replace("\\", "/").strip("/")
        if "\0" in rel:
            raise FileManagerError("invalid_path")
        norm = os.path.normpath(rel) if rel else "."
        if norm == ".":
            return self.root
        if norm.startswith("..") or os.path.isabs(norm):
            raise FileManagerError("invalid_path")
        # Resolve the parent (following symlinks) but keep the last component
        # as-is, so rename/delete act on a symlink itself, not on its target.
        parent = (self.root / norm).parent.resolve()
        if not (parent == self.root or parent.is_relative_to(self.root)):
            raise FileManagerError("invalid_path")
        p = parent / os.path.basename(norm)
        if not self._inside(p):  # symlink pointing outside root
            raise FileManagerError("invalid_path")
        return p

    def rel(self, p: Path) -> str:
        return p.relative_to(self.root).as_posix() if p != self.root else ""

    @staticmethod
    def check_name(name: str) -> str:
        name = (name or "").strip()
        if (
            not name
            or name in (".", "..")
            or "/" in name
            or "\\" in name
            or "\0" in name
            or len(name.encode()) > 255
        ):
            raise FileManagerError("invalid_name", name=name)
        return name

    def _existing(self, rel: str) -> Path:
        p = self.resolve(rel)
        if not os.path.lexists(p):
            raise FileManagerError("not_found", name=rel or "/")
        return p

    def _dir(self, rel: str) -> Path:
        p = self.resolve(rel)
        if not p.is_dir():
            raise FileManagerError("not_a_dir", name=rel or "/")
        return p

    # ------------------------------------------------------------------ quota
    def used_bytes(self) -> int:
        return self.usage() if self.usage is not None else tree_size(self.root)

    def _ensure_space(self, extra: int) -> None:
        if self.quota is None:
            return
        used = self.used_bytes()
        if used + extra > self.quota:
            raise FileManagerError(
                "quota_exceeded", need=extra, free=max(0, self.quota - used)
            )

    # ---------------------------------------------------------------- listing
    def list_dir(self, rel: str) -> list[dict]:
        d = self._dir(rel)
        entries = []
        with os.scandir(d) as it:
            for e in it:
                if not self.show_hidden and e.name.startswith("."):
                    continue
                try:
                    st = e.stat(follow_symlinks=True)
                except OSError:  # broken symlink
                    st = e.stat(follow_symlinks=False)
                is_dir = stat.S_ISDIR(st.st_mode)
                if e.is_symlink() and not self._inside(Path(e.path)):
                    continue  # never expose links pointing outside root
                entries.append(
                    {
                        "name": e.name,
                        "is_dir": is_dir,
                        "size": None if is_dir else st.st_size,
                        "mtime": st.st_mtime,
                        "ext": "" if is_dir else ext_of(e.name),
                    }
                )
        return entries

    def _inside(self, p: Path) -> bool:
        try:
            r = p.resolve()
        except OSError:
            return False
        return r == self.root or r.is_relative_to(self.root)

    # ------------------------------------------------------------- mutations
    def mkdir(self, rel_dir: str, name: str) -> str:
        target = self._dir(rel_dir) / self.check_name(name)
        if os.path.lexists(target):
            raise FileManagerError("exists", name=name)
        target.mkdir()
        return self.rel(target)

    def rename(self, rel: str, new_name: str) -> str:
        src = self._existing(rel)
        if src == self.root:
            raise FileManagerError("invalid_path")
        dst = src.parent / self.check_name(new_name)
        if dst == src:
            return rel
        # Allow case-only renames on case-insensitive filesystems.
        if os.path.lexists(dst) and not (
            src.name.lower() == dst.name.lower() and os.path.samefile(src, dst)
        ):
            raise FileManagerError("exists", name=new_name)
        src.rename(dst)
        return self.rel(dst)

    def delete(self, rels: list[str]) -> int:
        paths = [self._existing(r) for r in rels]
        for p in paths:
            if p == self.root:
                raise FileManagerError("invalid_path")
        for p in paths:
            if p.is_dir() and not p.is_symlink():
                shutil.rmtree(p)
            else:
                p.unlink()
        return len(paths)

    def _transfer_targets(self, rels: list[str], rel_dest: str) -> list[tuple[Path, Path]]:
        dest = self._dir(rel_dest)
        pairs = []
        for r in rels:
            src = self._existing(r)
            if src == self.root:
                raise FileManagerError("invalid_path")
            if src.is_dir() and (dest == src or dest.is_relative_to(src)):
                raise FileManagerError("into_itself", name=src.name)
            pairs.append((src, dest / src.name))
        return pairs

    def move(self, rels: list[str], rel_dest: str) -> int:
        pairs = self._transfer_targets(rels, rel_dest)
        for src, dst in pairs:
            if src == dst:
                continue
            if os.path.lexists(dst):
                raise FileManagerError("exists", name=dst.name)
        for src, dst in pairs:
            if src != dst:
                shutil.move(str(src), str(dst))
        return len(pairs)

    def copy(self, rels: list[str], rel_dest: str) -> int:
        pairs = self._transfer_targets(rels, rel_dest)
        self._ensure_space(sum(tree_size(s) for s, _ in pairs))
        for src, dst in pairs:
            dst = _unique(dst)
            if src.is_dir() and not src.is_symlink():
                shutil.copytree(src, dst, symlinks=True)
            else:
                shutil.copy2(src, dst, follow_symlinks=False)
        return len(pairs)

    def upload(self, rel_dir: str, files: list[tuple[str, bytes]], overwrite: bool = False) -> list[str]:
        d = self._dir(rel_dir)
        prepared = []
        for name, content in files:
            name = self.check_name(name)
            if self.allowed_extensions is not None and ext_of(name) not in self.allowed_extensions:
                raise FileManagerError("ext_not_allowed", name=name)
            if self.max_upload_size is not None and len(content) > self.max_upload_size:
                raise FileManagerError("too_large", name=name, max=self.max_upload_size)
            target = d / name
            if os.path.lexists(target):
                if overwrite and target.is_file():
                    pass
                else:
                    target = _unique(target)
            prepared.append((target, content))
        replaced = sum(t.stat().st_size for t, _ in prepared if t.is_file())
        self._ensure_space(sum(len(c) for _, c in prepared) - replaced)
        for target, content in prepared:
            target.write_bytes(content)
        return [t.name for t, _ in prepared]

    # ---------------------------------------------------------------- reading
    def download(self, rels: list[str]) -> tuple[str, str, bytes]:
        """Return (filename, mime, bytes). Directories / multiple items -> ZIP."""
        paths = [self._existing(r) for r in rels]
        if not paths:
            raise FileManagerError("nothing_selected")
        if len(paths) == 1 and paths[0].is_file():
            p = paths[0]
            mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            return p.name, mime, p.read_bytes()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in paths:
                base = p.parent
                if p.is_dir():
                    zf.write(p, p.relative_to(base).as_posix() + "/")
                    for sub in sorted(p.rglob("*")):
                        if sub.is_symlink() and not self._inside(sub):
                            continue
                        arc = sub.relative_to(base).as_posix()
                        zf.write(sub, arc + "/" if sub.is_dir() else arc)
                else:
                    zf.write(p, p.name)
        if len(paths) == 1:
            name = paths[0].name or "root"
        else:
            name = (paths[0].parent.name or self.root.name or "files")
        return f"{name}.zip", "application/zip", buf.getvalue()

    def preview(self, rel: str) -> dict:
        p = self._existing(rel)
        if not p.is_file():
            raise FileManagerError("not_a_file", name=p.name)
        ext = ext_of(p.name)
        size = p.stat().st_size
        if ext in IMAGE_EXTS:
            if size > PREVIEW_IMAGE_LIMIT:
                raise FileManagerError("preview_too_large", name=p.name)
            mime = "image/svg+xml" if ext == "svg" else (
                mimetypes.guess_type(p.name)[0] or "image/png"
            )
            b64 = base64.b64encode(p.read_bytes()).decode()
            return {"kind": "image", "name": p.name, "size": size, "src": f"data:{mime};base64,{b64}"}
        with p.open("rb") as fh:
            raw = fh.read(PREVIEW_TEXT_LIMIT + 1)
        truncated = len(raw) > PREVIEW_TEXT_LIMIT
        raw = raw[:PREVIEW_TEXT_LIMIT]
        if ext not in TEXT_EXTS and b"\0" in raw[:8192]:
            raise FileManagerError("no_preview", name=p.name)
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            if not truncated and ext not in TEXT_EXTS:
                # Not valid UTF-8 and not a known text type -> probably binary.
                if _looks_binary(raw):
                    raise FileManagerError("no_preview", name=p.name) from None
            text = raw.decode("utf-8", errors="replace") if truncated else raw.decode("latin-1")
        return {
            "kind": "text",
            "name": p.name,
            "size": size,
            "text": text,
            "lang": HLJS_LANG.get(ext, ext or "plaintext"),
            "truncated": truncated,
        }


def _looks_binary(raw: bytes) -> bool:
    sample = raw[:8192]
    if not sample:
        return False
    ctrl = sum(1 for b in sample if b < 9 or 13 < b < 32)
    return ctrl / len(sample) > 0.05


def tree_size(p: str | Path) -> int:
    """Total size in bytes of the files under ``p`` (symlinks not followed)."""
    try:
        st = os.lstat(p)
    except OSError:
        return 0
    if not stat.S_ISDIR(st.st_mode):
        return st.st_size if stat.S_ISREG(st.st_mode) else 0
    total = 0
    stack = [str(p)]
    while stack:
        try:
            with os.scandir(stack.pop()) as it:
                for e in it:
                    try:
                        if e.is_dir(follow_symlinks=False):
                            stack.append(e.path)
                        elif e.is_file(follow_symlinks=False):
                            total += e.stat(follow_symlinks=False).st_size
                    except OSError:
                        pass
        except OSError:
            pass
    return total


def _unique(target: Path) -> Path:
    """Return target, or 'name (1).ext', 'name (2).ext', ... if it exists."""
    if not os.path.lexists(target):
        return target
    stem, suffix = target.stem, target.suffix
    if target.is_dir():
        stem, suffix = target.name, ""
    i = 1
    while True:
        cand = target.with_name(f"{stem} ({i}){suffix}")
        if not os.path.lexists(cand):
            return cand
        i += 1
