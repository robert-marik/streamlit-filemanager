"""File manager component for Streamlit.

Usage::

    from st_filemanager import file_manager

    file_manager("/data/user1", quota="500MB")
"""

from .backend import FileManager, FileManagerError, parse_size, tree_size
from .component import file_manager
from .i18n import available_languages, message_keys, register_translation

__version__ = "0.2.0"

__all__ = [
    "FileManager",
    "FileManagerError",
    "__version__",
    "available_languages",
    "file_manager",
    "message_keys",
    "parse_size",
    "tree_size",
    "register_translation",
]
