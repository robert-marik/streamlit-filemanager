"""Localization of the file manager UI.

Bundled translations live in ``st_filemanager/locales/<lang>.json``. Each
message is either a string or, for count-dependent messages, an object keyed
by Unicode CLDR plural category (``zero``, ``one``, ``two``, ``few``, ``many``,
``other``) that the browser selects with ``Intl.PluralRules``. Placeholders use
``{name}`` syntax. English is the fallback for anything missing.

Add a language either by registering it at runtime::

    from st_filemanager import register_translation
    register_translation("de", {"upload": "Hochladen", ...})

or by passing ``translations={...}`` to ``file_manager()`` to override single
messages, or by contributing a new JSON file to ``locales/``.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from importlib import resources
from typing import Union

Message = Union[str, Mapping[str, str]]
Messages = Mapping[str, Message]

DEFAULT_LANGUAGE = "en"
_registered: dict[str, dict[str, Message]] = {}


@cache
def _bundled() -> dict[str, dict[str, Message]]:
    out = {}
    for entry in resources.files(__package__).joinpath("locales").iterdir():
        if entry.name.endswith(".json"):
            out[entry.name[:-5].lower()] = json.loads(entry.read_text(encoding="utf-8"))
    return out


def _catalogs() -> dict[str, dict[str, Message]]:
    merged = {k: dict(v) for k, v in _bundled().items()}
    for lang, msgs in _registered.items():
        merged.setdefault(lang, {}).update(msgs)
    return merged


def register_translation(lang: str, messages: Messages) -> None:
    """Add or extend a translation for ``lang`` (e.g. "de" or "pt-br").

    Missing keys fall back to English. Use ``message_keys()`` or
    ``locales/en.json`` to see every key.
    """
    _registered.setdefault(lang.lower(), {}).update(messages)


def available_languages() -> dict[str, str]:
    """Return ``{language code: display name}`` for bundled and registered languages."""
    return {code: str(msgs.get("_language", code)) for code, msgs in sorted(_catalogs().items())}


def message_keys() -> list[str]:
    """All message keys that a translation can provide."""
    return sorted(k for k in _bundled()[DEFAULT_LANGUAGE] if not k.startswith("_"))


def match_language(lang: str | None) -> str | None:
    """Best available catalog for a BCP 47 tag: exact ("pt-br"), then primary ("pt")."""
    if not lang:
        return None
    cats = _catalogs()
    tag = lang.replace("_", "-").lower()
    if tag in cats:
        return tag
    primary = tag.split("-")[0]
    return primary if primary in cats else None


def resolve_messages(
    lang: str | None, overrides: Messages | None = None
) -> tuple[str, dict[str, Message]]:
    """Return ``(locale for Intl formatting, merged messages)``.

    The locale is the requested tag when a translation exists for it (so a
    browser locale like "cs-CZ" keeps its regional date format); otherwise
    English.
    """
    cats = _catalogs()
    matched = match_language(lang)
    messages = dict(cats[DEFAULT_LANGUAGE])
    if matched and matched != DEFAULT_LANGUAGE:
        messages.update(cats[matched])
    if overrides:
        messages.update(overrides)
    locale = lang.replace("_", "-") if matched and lang else DEFAULT_LANGUAGE
    return locale, messages
