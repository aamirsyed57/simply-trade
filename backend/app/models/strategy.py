"""Strategy registry model — metadata for pluggable strategies."""

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin


class Strategy(Base, TimestampMixin):
    __tablename__ = "strategies"

    # Natural PK — strategy code is immutable identifier
    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # JSON Schema used by the frontend to render the params form
    params_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Defaults used when creating an assignment without custom params
    default_params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    assignments: Mapped[list["PortfolioSymbolStrategy"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="strategy"
    )

    def __repr__(self) -> str:
        return f"<Strategy code={self.code!r} name={self.name!r}>"
