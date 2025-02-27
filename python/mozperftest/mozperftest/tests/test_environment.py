#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
from pathlib import Path
import mozunit
import mock
import pytest

from mozperftest.environment import MachEnvironment
from mozperftest.tests.support import get_running_env, requests_content


HERE = Path(__file__).parent.resolve()


def test_run_hooks():
    hooks = str(Path(HERE, "data", "hook.py"))
    env = MachEnvironment(mock.MagicMock(), hooks=hooks)
    assert env.run_hook("doit") == "OK"


def test_bad_hooks():
    hooks = "Idontexists"
    with pytest.raises(IOError):
        MachEnvironment(mock.MagicMock(), hooks=hooks)


doit = [b"def doit(*args, **kw):\n", b"    return 'OK'\n"]


@mock.patch("mozperftest.utils.requests.get", requests_content(doit))
def test_run_hooks_url():
    hooks = "http://somewhere/hooks.py"
    env = MachEnvironment(mock.MagicMock(), hooks=hooks)
    assert env.run_hook("doit") == "OK"


def test_layers():
    env = MachEnvironment(mock.MagicMock())
    assert env.get_layer("browsertime").name == "browsertime"


def test_context():
    mach, metadata, env = get_running_env()
    env.layers = [mock.MagicMock(), mock.MagicMock()]
    with env:
        env.run(metadata)


if __name__ == "__main__":
    mozunit.main()
