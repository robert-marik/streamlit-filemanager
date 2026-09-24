"""Demo app: streamlit run example_app.py"""

from pathlib import Path

import streamlit as st

from st_filemanager import available_languages, file_manager

st.set_page_config(page_title="File manager demo", layout="wide")

DEMO = Path(__file__).parent / "demo_data"
if not DEMO.exists():
    (DEMO / "docs" / "notes").mkdir(parents=True)
    (DEMO / "images").mkdir()
    (DEMO / "README.md").write_text("# Demo\n\nSome *markdown* text.\n")
    (DEMO / "docs" / "script.py").write_text('def hello(name: str) -> str:\n    return f"Hello {name}"\n')
    (DEMO / "docs" / "data.csv").write_text("a,b\n1,2\n3,4\n")
    (DEMO / "docs" / "notes" / "todo.txt").write_text("- buy milk\n")
    (DEMO / "images" / "logo.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">'
        '<circle cx="60" cy="60" r="50" fill="#ff4b4b"/></svg>'
    )

with st.sidebar:
    languages = {None: "Browser default", **available_languages()}
    lang = st.selectbox("Language", list(languages), format_func=languages.get)
    quota = st.selectbox("Quota", ["1MB", "10MB", "100MB", None], index=1, format_func=lambda q: q or "Unlimited")
    read_only = st.toggle("Read only")
    show_hidden = st.toggle("Show hidden files")

st.title("📁 Streamlit File Manager")

tab_inline, tab_dialog = st.tabs(["Inline", "In a dialog"])

with tab_inline:
    result = file_manager(
        DEMO, quota=quota, key="fm_inline", lang=lang,
        read_only=read_only, show_hidden=show_hidden,
    )
    if result:
        st.caption(f"Last action: `{result}`")


@st.dialog("File manager", width="large")
def files_dialog():
    result = file_manager(DEMO, quota=quota, key="fm_dialog", height=480, lang=lang, read_only=read_only)
    if result and not result.get("ok"):
        st.caption(f"Error: {result.get('error')}")


with tab_dialog:
    if st.button("Open file manager", icon="📂"):
        files_dialog()
