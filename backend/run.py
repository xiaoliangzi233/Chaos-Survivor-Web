import argparse

import uvicorn

from .app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Survivor FastAPI backend.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5010)
    parser.add_argument("--db", default=None)
    args = parser.parse_args()
    uvicorn.run(create_app(args.db), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
