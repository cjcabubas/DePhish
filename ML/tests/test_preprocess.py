"""
test_preprocess.py - Tests text sanitization and data preprocessing functions.
"""

import pytest
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.data.preprocess import clean_text


def test_clean_text_normalizes_spaces():
    raw = "  Hello   world! \n\n Test  email   message.  "
    cleaned = clean_text(raw)
    assert cleaned == "Hello world! Test email message."


def test_clean_text_handles_empty_and_none():
    assert clean_text("") == ""
    assert clean_text(None) == ""
    assert clean_text("     ") == ""


def test_clean_text_removes_non_printable():
    raw = "Hello\x00\x01\x02World!"
    cleaned = clean_text(raw)
    assert cleaned == "HelloWorld!"
