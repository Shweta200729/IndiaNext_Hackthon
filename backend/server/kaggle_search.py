"""
server/kaggle_search.py

Kaggle Dataset Discovery integration for the IndiaNext FL Platform.

Searches Kaggle datasets by task type (computer vision, NLP, tabular).
Requires KAGGLE_USERNAME and KAGGLE_KEY in environment or ~/.kaggle/kaggle.json.

If Kaggle credentials are not set, returns curated fallback datasets.

Usage:
  from server.kaggle_search import search_datasets
  results = search_datasets("computer vision", max_results=5)
"""

import logging
import os
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Curated fallback datasets (no API key needed)
# ---------------------------------------------------------------------------

FALLBACK_DATASETS: Dict[str, List[Dict]] = {
    "computer vision": [
        {
            "title": "CIFAR-10 Image Classification",
            "description": "60,000 32x32 color images in 10 classes for image recognition tasks.",
            "url": "https://www.kaggle.com/c/cifar-10",
            "size": "163 MB",
            "task": "computer vision",
        },
        {
            "title": "Dogs vs. Cats",
            "description": "25,000 labeled images of dogs and cats for binary classification.",
            "url": "https://www.kaggle.com/c/dogs-vs-cats",
            "size": "543 MB",
            "task": "computer vision",
        },
        {
            "title": "MNIST Handwritten Digits",
            "description": "70,000 grayscale images of handwritten digits 0-9 for digit recognition.",
            "url": "https://www.kaggle.com/datasets/hojjatk/mnist-dataset",
            "size": "11 MB",
            "task": "computer vision",
        },
        {
            "title": "Chest X-Ray Images (Pneumonia)",
            "description": "5,863 X-Ray images (JPEG) for pneumonia classification.",
            "url": "https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia",
            "size": "1 GB",
            "task": "computer vision",
        },
        {
            "title": "Face Mask Detection",
            "description": "853 images of people with and without face masks.",
            "url": "https://www.kaggle.com/datasets/andrewmvd/face-mask-detection",
            "size": "12 MB",
            "task": "computer vision",
        },
    ],
    "nlp": [
        {
            "title": "IMDB Movie Reviews Sentiment",
            "description": "50,000 movie reviews for binary sentiment classification (positive/negative).",
            "url": "https://www.kaggle.com/datasets/lakshmi25npathi/imdb-dataset-of-50k-movie-reviews",
            "size": "66 MB",
            "task": "nlp",
        },
        {
            "title": "Twitter US Airline Sentiment",
            "description": "14,640 tweets about US airlines labeled by sentiment.",
            "url": "https://www.kaggle.com/datasets/crowdflower/twitter-airline-sentiment",
            "size": "3 MB",
            "task": "nlp",
        },
        {
            "title": "Fake and Real News Dataset",
            "description": "23,502 real and 21,417 fake news articles for fake news detection.",
            "url": "https://www.kaggle.com/datasets/clmentbisaillon/fake-and-real-news-dataset",
            "size": "47 MB",
            "task": "nlp",
        },
        {
            "title": "Amazon Product Reviews",
            "description": "568,454 Amazon reviews across multiple categories.",
            "url": "https://www.kaggle.com/datasets/bittlingmayer/amazonreviews",
            "size": "500 MB",
            "task": "nlp",
        },
        {
            "title": "SMS Spam Collection",
            "description": "5,572 SMS messages labeled as spam or ham.",
            "url": "https://www.kaggle.com/datasets/uciml/sms-spam-collection-dataset",
            "size": "460 KB",
            "task": "nlp",
        },
    ],
    "tabular": [
        {
            "title": "Titanic: Machine Learning from Disaster",
            "description": "Passenger data from the Titanic to predict survival outcomes.",
            "url": "https://www.kaggle.com/c/titanic",
            "size": "60 KB",
            "task": "tabular",
        },
        {
            "title": "House Prices: Advanced Regression Techniques",
            "description": "79 explanatory variables describing residential homes with 1460 entries.",
            "url": "https://www.kaggle.com/c/house-prices-advanced-regression-techniques",
            "size": "320 KB",
            "task": "tabular",
        },
        {
            "title": "Diabetes Dataset",
            "description": "768 diagnostic measurements for diabetes prediction (Pima Indian).",
            "url": "https://www.kaggle.com/datasets/uciml/pima-indians-diabetes-database",
            "size": "23 KB",
            "task": "tabular",
        },
        {
            "title": "Credit Card Fraud Detection",
            "description": "284,807 credit card transactions; 492 are fraudulent.",
            "url": "https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud",
            "size": "143 MB",
            "task": "tabular",
        },
        {
            "title": "Iris Species",
            "description": "150 measurements from 3 iris species for classification.",
            "url": "https://www.kaggle.com/datasets/uciml/iris",
            "size": "4 KB",
            "task": "tabular",
        },
    ],
}

# Alias normalization map
TASK_ALIASES: Dict[str, str] = {
    "cv": "computer vision",
    "image": "computer vision",
    "vision": "computer vision",
    "images": "computer vision",
    "text": "nlp",
    "language": "nlp",
    "natural language processing": "nlp",
    "sentiment": "nlp",
    "classification": "tabular",
    "regression": "tabular",
    "structured": "tabular",
    "csv": "tabular",
}


def _normalize_task(query: str) -> str:
    """Normalize a query string to one of the 3 known task types."""
    q = query.lower().strip()
    for alias, canonical in TASK_ALIASES.items():
        if alias in q:
            return canonical
    for canonical in ("computer vision", "nlp", "tabular"):
        if canonical in q:
            return canonical
    return "tabular"  # default fallback


def _search_via_kaggle_api(query: str, max_results: int) -> Optional[List[Dict]]:
    """
    Try to search Kaggle using the official SDK.
    Returns None if credentials are missing or API call fails.
    """
    username = os.environ.get("KAGGLE_USERNAME", "")
    key = os.environ.get("KAGGLE_KEY", "")

    if not username or not key:
        return None

    try:
        import kaggle
        from kaggle.api.kaggle_api_extended import KaggleApiExtended

        api = KaggleApiExtended()
        api.authenticate()

        datasets = api.dataset_list(search=query, max_size=None)
        results = []
        for ds in datasets[:max_results]:
            results.append(
                {
                    "title": ds.title,
                    "description": getattr(ds, "subtitle", "No description available."),
                    "url": f"https://www.kaggle.com/datasets/{ds.ref}",
                    "size": str(getattr(ds, "totalBytes", "Unknown")),
                    "task": query,
                }
            )
        return results if results else None

    except Exception as e:
        logger.warning(f"[Kaggle] API search failed: {e}. Using fallback.")
        return None


def search_datasets(query: str, max_results: int = 5) -> List[Dict]:
    """
    Search for Kaggle datasets by task type.

    Args:
        query: Task description — 'computer vision', 'nlp', or 'tabular'.
        max_results: Maximum number of results to return.

    Returns:
        List of dataset dicts: {title, description, url, size, task}.
    """
    task = _normalize_task(query)

    # Try real Kaggle API first
    kaggle_results = _search_via_kaggle_api(query, max_results)
    if kaggle_results:
        logger.info(f"[Kaggle] API returned {len(kaggle_results)} results for '{query}'")
        return kaggle_results

    # Fall back to curated list
    fallback = FALLBACK_DATASETS.get(task, FALLBACK_DATASETS["tabular"])
    results = fallback[:max_results]
    logger.info(
        f"[Kaggle] Using fallback datasets for task='{task}': {len(results)} items"
    )
    return results
