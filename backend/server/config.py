import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ML Hyperparameters
    LEARNING_RATE: float = 0.01

    # Security & Byzantine Detection
    NORM_THRESHOLD: float = 50.0  # Max L2 norm of update
    DISTANCE_THRESHOLD: float = 20.0  # Max L2 distance from global model

    # Differential Privacy
    DP_ENABLED: bool = False
    CLIP_NORM: float = 10.0  # L2 norm clipping threshold
    NOISE_MULTIPLIER: float = 1.0  # Scale for Gaussian noise

    # Aggregation
    AGGREGATION_METHOD: str = "FedAvg"  # Or "TrimmedMean"
    TRIM_RATIO: float = 0.1  # Top/bottom fraction to trim (if TrimmedMean)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
