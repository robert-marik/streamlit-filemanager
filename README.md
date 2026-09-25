# streamlit-filemanager

A file manager component for [Streamlit](https://streamlit.io). Give it a directory
(and optionally a quota) and your users can browse, upload, download, rename, move,
copy, delete and preview files. It works inline on a page and as an overlay inside
`st.dialog`.

The frontend is plain JavaScript on Streamlit Custom Components v2, so there is no
Node/npm build step.

## Installation

```bash
pip install streamlit-filemanager
# or from a checkout
pip install .
```

The distribution is called `streamlit-filemanager`; the import name is `st_filemanager`.

Requires Python ≥ 3.10 and Streamlit ≥ 1.51 (developed and tested with 1.62).

## Usage

```python
import streamlit as st
from st_filemanager import file_manager

file_manager("/data/user1", quota="500MB", key="fm")
```

Inside a dialog:

```python
@st.dialog("Files", width="large")
def files():
    file_manager("/data/user1", quota="500MB", key="fm_dialog", height=480)

if st.button("Open files"):
    files()
```

### Parameters

| Parameter | Default | Description |
|---|---|---|
| `root` | required | Directory the user may manage (created if missing). Nothing outside it is reachable. |
| `quota` | `None` | Maximum total size of `root`, in bytes or as `"500MB"`, `"2 GB"`. `None` = unlimited. |
| `key` | `"file_manager"` | Widget key. Use different keys for multiple instances. |
| `height` | `520` | Height in pixels. |
| `read_only` | `False` | Hide and reject every modifying operation. |
| `show_hidden` | `False` | List dot-files. |
| `max_upload_size` | `"100MB"` | Per-file upload limit. |
| `allowed_extensions` | `None` | e.g. `["pdf", "png"]` to restrict uploads. |
| `lang` | `None` | UI language (BCP 47 tag). `None` = browser locale, falling back to English. |
| `translations` | `None` | Per-instance message overrides, e.g. `{"upload": "Add files"}`. |

The function returns a description of the operation performed during this run, for
example `{"op": "upload", "ok": True, "paths": ["report.pdf"]}` or
`{"op": "delete", "ok": False, "error": "quota_exceeded", "params": {...}}`, or `None`.

## Features

- Browsing folders with breadcrumbs, a search filter, and sorting by name, size or date (folders stay on top)
- Upload with the button or drag & drop, with an overwrite / keep-both prompt on name clashes
- Download a file directly, or a folder / several items as a ZIP
- New folder, rename, delete (with confirmation), cut / copy / paste, drag rows onto a folder to move (Ctrl = copy)
- Preview of images and text / source code with syntax highlighting
- In-place editing of UTF-8 text files (YAML, CSV, TXT, README, …) from the preview; Ctrl+S saves
- Context menu and keyboard shortcuts: Enter, Backspace, Delete, F2, F5, Ctrl+A/C/X/V/F, arrow keys
- Quota indicator, light and dark theme following the Streamlit theme
- Localizable UI (English and Czech bundled)

## Localization

Bundled languages live in `st_filemanager/locales/<lang>.json`. Missing messages fall
back to English. A language tag such as `de-AT` matches `de-at.json` first, then `de.json`.

Add a language at runtime:

```python
from st_filemanager import register_translation, message_keys

register_translation("de", {
    "upload": "Hochladen",
    "download": "Herunterladen",
    "items": {"one": "{n} Element", "other": "{n} Elemente"},
    # ... see message_keys() or locales/en.json for all keys
})
file_manager("/data", lang="de")
```

Messages that depend on a count are objects keyed by
[CLDR plural category](https://cldr.unicode.org/index/cldr-spec/plural-rules)
(`zero`, `one`, `two`, `few`, `many`, `other`). The browser picks the category with
`Intl.PluralRules`, so languages with complex plurals work. Placeholders use `{name}`
syntax; size placeholders (`{size}`, `{free}`, `{max}`, …) are formatted automatically.
Dates and numbers use the locale's formats.

To contribute a language, copy `locales/en.json` to `locales/<code>.json`, translate
the values and set `_language` to the language's own name.

`available_languages()` returns `{code: name}` for every bundled and registered language.

## Security

- Every client-supplied path is resolved against `root`. `..`, absolute paths and
  symlinks pointing outside `root` are rejected, and such symlinks are hidden from listings.
- Deleting or renaming a symlink affects the link, not its target.
- Quota, upload size, allowed extensions and `read_only` are enforced on the server.
- The component does no authentication. Choose `root` per user in your app.

## Limitations

- Files travel over the Streamlit websocket as base64. Keep `max_upload_size` and
  the sizes of downloads below `server.maxMessageSize` (default 200 MB) divided by about 1.4.
- Syntax highlighting loads highlight.js from cdn.jsdelivr.net. Offline, text is shown unhighlighted.
- Whole folders cannot be uploaded, only files.

## Development

```bash
pip install -e ".[test]"
pytest
streamlit run example_app.py
```

## License

MIT © Robert Mařík
