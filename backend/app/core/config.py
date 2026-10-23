import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "VASTRENIX"
    PROJECT_TAGLINE: str = "Your Business, Beautifully in Sync."
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "vastrenix-dev-super-secure-key-2026-garments-erp")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./vastrenix.db")
    
    # Media & Invoices
    STORAGE_DIR: str = os.getenv("STORAGE_DIR", "./storage")
    INVOICE_DIR: str = os.getenv("STORAGE_DIR", "./storage/invoices")
    QR_DIR: str = os.getenv("STORAGE_DIR", "./storage/qr")
    
    class Config:
        case_sensitive = True

settings = Settings()

# Ensure directories exist
os.makedirs(settings.STORAGE_DIR, exist_ok=True)
os.makedirs(settings.INVOICE_DIR, exist_ok=True)
os.makedirs(settings.QR_DIR, exist_ok=True)
