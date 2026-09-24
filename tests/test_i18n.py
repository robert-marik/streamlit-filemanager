import json
from importlib import resources

from st_filemanager import available_languages, message_keys, register_translation
from st_filemanager.i18n import _registered, match_language, resolve_messages

LOCALES = resources.files("st_filemanager").joinpath("locales")


def test_bundled_catalogs_complete():
    en = json.loads(LOCALES.joinpath("en.json").read_text(encoding="utf-8"))
    for f in LOCALES.iterdir():
        cat = json.loads(f.read_text(encoding="utf-8"))
        assert set(cat) == set(en), f.name
        for k, v in cat.items():
            if isinstance(v, dict):
                assert "other" in v, (f.name, k)


def test_available_languages():
    langs = available_languages()
    assert langs["en"] == "English" and langs["cs"] == "Čeština"


def test_match_and_fallback():
    assert match_language("cs-CZ") == "cs"
    assert match_language("en_US") == "en"
    assert match_language("xx") is None
    locale, msgs = resolve_messages("cs-CZ")
    assert locale == "cs-CZ" and msgs["upload"] == "Nahrát"
    locale, msgs = resolve_messages("xx")
    assert locale == "en" and msgs["upload"] == "Upload"
    locale, msgs = resolve_messages(None)
    assert locale == "en"


def test_overrides_and_registration():
    _, msgs = resolve_messages("en", {"upload": "Add files"})
    assert msgs["upload"] == "Add files" and msgs["download"] == "Download"
    try:
        register_translation("de", {"upload": "Hochladen", "_language": "Deutsch"})
        assert available_languages()["de"] == "Deutsch"
        locale, msgs = resolve_messages("de-AT")
        assert locale == "de-AT" and msgs["upload"] == "Hochladen"
        assert msgs["download"] == "Download"  # English fallback
    finally:
        _registered.clear()


def test_message_keys():
    keys = message_keys()
    assert "upload" in keys and "_language" not in keys
