from sqlmodel import SQLModel, create_engine, Session

import os

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# Default to SQLite for local development
sqlite_url = f"sqlite:///data/database.db"
# Get DB URL from env, or use SQLite default
database_url = os.getenv("DATABASE_URL", sqlite_url)

# Fix for standard Postgres URL format if needed (some providers use postgres:// instead of postgresql://)
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

if "sqlite" in database_url:
    connect_args = {"check_same_thread": False}
    engine = create_engine(database_url, connect_args=connect_args)
else:
    # PostgreSQL connection (Production)
    engine = create_engine(database_url)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
