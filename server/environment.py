import os
import sys

def _get_environment_variable(key: str, cast_int: bool = False, cast_str: bool = False, required: bool = True) -> str|int|None:
    value = os.environ.get(key)

    if not value:
        if required:
            print(f"Environment variable '{key}' is not set. Aborting...")
            sys.exit(1)
        return None

    if cast_int:
        try:
            return int(value)
        except ValueError:
            print(f"Environment variable '{key}' should be an integer, got '{value}'")
            sys.exit(1)

    return value

DATA_PATH = _get_environment_variable("DATA_PATH")
SECRET_KEY = _get_environment_variable("SECRET_KEY")
AUTH_HEADER = _get_environment_variable("AUTH_HEADER", required=False)
TOKEN_DURATION = _get_environment_variable("TOKEN_DURATION", cast_int=True)
ENABLE_EXTERNAL_APIS = str(_get_environment_variable("ENABLE_EXTERNAL_APIS")).lower() == "true"
FR24_EMAIL = _get_environment_variable("FR24_EMAIL", required=False)
FR24_PASSWORD = _get_environment_variable("FR24_PASSWORD", required=False)
FLIGHTERA_API_KEY = _get_environment_variable("FLIGHTERA_API_KEY", required=False)
