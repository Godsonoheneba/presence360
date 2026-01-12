import logging
import os
import time


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    api_url = os.getenv("TENANT_API_URL", "")
    logging.info("Gate agent simulator starting. TENANT_API_URL=%s", api_url)
    while True:
        time.sleep(30)


if __name__ == "__main__":
    main()
