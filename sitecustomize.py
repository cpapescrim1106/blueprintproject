try:
    import bcrypt  # type: ignore
    if not hasattr(bcrypt, "__about__"):
        class _About:
            __slots__ = ("__version__",)

            def __init__(self, version: str) -> None:
                self.__version__ = version

        setattr(
            bcrypt,
            "__about__",
            _About(getattr(bcrypt, "__version__", "0")),
        )
except Exception:
    pass
