import io
import os
import zipfile

import pytest

from st_filemanager.backend import FileManager, FileManagerError, parse_size


@pytest.fixture
def fm(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    (root / "a.txt").write_text("hello")
    (root / "sub").mkdir()
    (root / "sub" / "b.py").write_text("print(1)\n")
    return FileManager(root=root)


def test_parse_size():
    assert parse_size(None) is None
    assert parse_size(10) == 10
    assert parse_size("1k") == 1024
    assert parse_size("500MB") == 500 * 1024**2
    assert parse_size("1.5 GB") == int(1.5 * 1024**3)
    with pytest.raises(ValueError):
        parse_size("lots")


@pytest.mark.parametrize("bad", ["..", "../x", "sub/../../x", "/etc/passwd", "a\0b"])
def test_traversal_rejected(fm, bad):
    if bad == "/etc/passwd":
        # leading slash is treated as relative to root, never as absolute
        assert fm.resolve(bad) == fm.root / "etc" / "passwd"
        return
    with pytest.raises(FileManagerError):
        fm.resolve(bad)


def test_symlink_outside_hidden_and_rejected(fm, tmp_path):
    outside = tmp_path / "secret"
    outside.mkdir()
    (outside / "s.txt").write_text("x")
    os.symlink(outside, fm.root / "link")
    assert "link" not in [e["name"] for e in fm.list_dir("")]
    with pytest.raises(FileManagerError):
        fm.list_dir("link")
    with pytest.raises(FileManagerError):
        fm.preview("link/s.txt")


def test_delete_symlink_keeps_target(fm):
    os.symlink(fm.root / "a.txt", fm.root / "alias")
    fm.delete(["alias"])
    assert (fm.root / "a.txt").exists()


def test_list_and_mkdir(fm):
    names = {e["name"]: e for e in fm.list_dir("")}
    assert names["sub"]["is_dir"] and names["a.txt"]["size"] == 5
    assert fm.mkdir("sub", "new") == "sub/new"
    with pytest.raises(FileManagerError) as ei:
        fm.mkdir("sub", "new")
    assert ei.value.code == "exists"
    with pytest.raises(FileManagerError):
        fm.mkdir("", "x/y")


def test_hidden(fm):
    (fm.root / ".secret").write_text("x")
    assert ".secret" not in [e["name"] for e in fm.list_dir("")]
    fm.show_hidden = True
    assert ".secret" in [e["name"] for e in fm.list_dir("")]


def test_rename(fm):
    assert fm.rename("a.txt", "c.txt") == "c.txt"
    (fm.root / "d.txt").write_text("")
    with pytest.raises(FileManagerError):
        fm.rename("c.txt", "d.txt")
    with pytest.raises(FileManagerError):
        fm.rename("", "x")


def test_delete(fm):
    assert fm.delete(["a.txt", "sub"]) == 2
    assert fm.list_dir("") == []
    with pytest.raises(FileManagerError):
        fm.delete([""])


def test_move_copy(fm):
    fm.move(["a.txt"], "sub")
    assert (fm.root / "sub" / "a.txt").exists()
    fm.copy(["sub/a.txt"], "sub")
    assert (fm.root / "sub" / "a (1).txt").exists()
    fm.copy(["sub"], "")
    assert (fm.root / "sub (1)" / "b.py").exists()
    with pytest.raises(FileManagerError):
        fm.move(["sub"], "sub")
    with pytest.raises(FileManagerError):
        fm.copy(["sub"], "sub")

def test_move_conflict(fm):
    (fm.root / "sub" / "a.txt").write_text("other")
    with pytest.raises(FileManagerError):
        fm.move(["a.txt"], "sub")


def test_quota(fm):
    fm.quota = fm.used_bytes() + 10
    fm.upload("", [("ok.bin", b"x" * 10)])
    with pytest.raises(FileManagerError) as ei:
        fm.upload("", [("big.bin", b"x")])
    assert ei.value.code == "quota_exceeded"
    with pytest.raises(FileManagerError):
        fm.copy(["a.txt"], "sub")
    # overwriting with a same-size file does not need extra space
    fm.upload("", [("ok.bin", b"y" * 10)], overwrite=True)
    assert (fm.root / "ok.bin").read_bytes() == b"y" * 10


def test_custom_usage(fm):
    fm.quota, fm.usage = 100, lambda: 95
    assert fm.used_bytes() == 95
    with pytest.raises(FileManagerError) as ei:
        fm.upload("", [("big.bin", b"x" * 6)])
    assert ei.value.code == "quota_exceeded"
    fm.upload("", [("ok.bin", b"x" * 5)])


def test_upload_rules(fm):
    fm.allowed_extensions = frozenset({"txt"})
    fm.max_upload_size = 4
    with pytest.raises(FileManagerError):
        fm.upload("", [("x.exe", b"1")])
    with pytest.raises(FileManagerError):
        fm.upload("", [("x.txt", b"12345")])
    assert fm.upload("", [("a.txt", b"1")]) == ["a (1).txt"]


def test_download(fm):
    name, mime, data = fm.download(["a.txt"])
    assert (name, data) == ("a.txt", b"hello") and mime == "text/plain"
    name, mime, data = fm.download(["sub", "a.txt"])
    assert name.endswith(".zip")
    names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    assert "sub/b.py" in names and "a.txt" in names


def test_preview(fm):
    p = fm.preview("sub/b.py")
    assert p["kind"] == "text" and p["lang"] == "python" and "print" in p["text"]
    (fm.root / "img.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\0" * 10)
    assert fm.preview("img.png")["src"].startswith("data:image/png;base64,")
    (fm.root / "bin.dat").write_bytes(bytes(range(256)) * 10)
    with pytest.raises(FileManagerError):
        fm.preview("bin.dat")


def test_save_text(fm):
    p = fm.preview("sub/b.py")
    assert p["editable"]
    fm.save_text("sub/b.py", "x = 1\n")
    assert (fm.root / "sub/b.py").read_text() == "x = 1\n"
    with pytest.raises(FileManagerError):
        fm.save_text("sub", "x")
    with pytest.raises(FileManagerError):
        fm.save_text("../escape.txt", "x")


def test_save_text_detects_external_change(fm):
    mtime = fm.preview("sub/b.py")["mtime"]
    fm.save_text("sub/b.py", "mine\n", mtime)  # unchanged -> ok
    os.utime(fm.root / "sub/b.py", (0, mtime + 5))  # someone else edits it
    with pytest.raises(FileManagerError) as e:
        fm.save_text("sub/b.py", "stale\n", mtime)
    assert e.value.code == "changed_on_disk"
    assert (fm.root / "sub/b.py").read_text() == "mine\n"


def test_create_file(fm):
    assert fm.create_file("sub", "pasted.csv", "a,b\n1,2\n") == "sub/pasted.csv"
    assert (fm.root / "sub/pasted.csv").read_text() == "a,b\n1,2\n"
    with pytest.raises(FileManagerError) as e:
        fm.create_file("sub", "pasted.csv", "x")
    assert e.value.code == "exists"
    with pytest.raises(FileManagerError):
        fm.create_file("", "../escape.txt", "x")
