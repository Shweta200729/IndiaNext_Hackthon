"""
server/rag.py

RAG (Retrieval-Augmented Generation) Chatbot for the IndiaNext FL Platform.

Uses:
  - LangChain for orchestration
  - ChromaDB as the vector store (persisted locally at ./chroma_db)
  - sentence-transformers/all-MiniLM-L6-v2 for embeddings (no OpenAI needed)
  - Groq API (llama-4-scout-17b) as the LLM for answer generation

Knowledge sources:
  - Platform documentation (hardcoded texts below)
  - Dataset metadata (from Supabase at query time)
  - Experiment history (from Supabase at query time)

Usage:
  from server.rag import query_rag
  answer = query_rag("How do I contribute a model?")
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Platform documentation corpus
# ---------------------------------------------------------------------------

PLATFORM_DOCS = [
    "IndiaNext is a scalable AI collaboration platform for federated learning. "
    "It allows contributors to train machine learning models locally and upload "
    "weight updates to a global aggregation server without sharing raw data.",

    "Federated Learning (FL) is a machine learning approach where a model is "
    "trained across many decentralized devices or servers holding local data samples. "
    "Clients download the global model, train locally, and upload only weight updates (.pt files).",

    "To contribute a model: go to the Dashboard → Local Dataset Training section. "
    "Upload a CSV dataset file or provide a URL. The backend trains a model on your data "
    "and you can download the resulting .pt weight file. Then upload it via POST /fl/update.",

    "The server uses FedAvg (Federated Averaging) as the primary aggregation strategy. "
    "Optional DP (Differential Privacy) with Gaussian noise and Trimmed Mean are also available. "
    "Each aggregation creates a new global model version stored in Supabase.",

    "The Meta-Learning Layer evaluates each incoming model update using validation accuracy. "
    "Updates with below-threshold accuracy are REJECTED. "
    "Accepted updates are weighted by their validation score before aggregation.",

    "The Dataset Discovery feature lets you search the Kaggle dataset registry by task type: "
    "computer vision, NLP, or tabular. Use GET /fl/datasets/search?q=<task> to get results "
    "including dataset title, description, and a direct Kaggle link.",

    "All experiments are tracked using MLflow. "
    "Metrics tracked include: training accuracy, validation accuracy, loss, training round number, "
    "contributor name, and dataset name. View the experiment history in the dashboard.",

    "The platform includes a simulated blockchain token economy. "
    "Contributors earn FLT (Federated Learning Tokens) for accepted updates and are penalized "
    "for rejected (Byzantine) updates.",

    "Two registered users can collaborate in a federated learning session. "
    "Use the Collaborate tab to invite another user. "
    "Both parties train on their local data in an isolated session and the results are merged.",

    "Security features include: file extension validation (.pt only), 200MB file size cap, "
    "safe torch.load with weights_only=True, key and shape validation, "
    "and Byzantine anomaly detection (L2 norm + cosine distance checks).",

    "The frontend is deployed on Vercel. The backend is deployed on Railway. "
    "The ChromaDB vector store is persisted locally. "
    "All secrets and API keys are stored as environment variables.",

    "To get started: 1) Sign up via /api/auth/signup. 2) Login via /api/auth/login. "
    "3) Go to Dashboard. 4) Upload a CSV dataset to train and contribute. "
    "5) Use the Collaborate tab to train with partners.",

    "The contributor leaderboard ranks participants by total accepted model updates. "
    "Score = Accepted × 10 − Rejected × 5. View rankings at GET /fl/leaderboard.",

    "The RAG (Retrieval-Augmented Generation) chatbot is powered by Groq llama-4-scout "
    "and ChromaDB with sentence-transformer embeddings. It answers questions about the platform.",
]


# ---------------------------------------------------------------------------
# Lazy-loaded singletons
# ---------------------------------------------------------------------------

_vectorstore = None
_retriever = None
_embeddings = None
_groq_client = None


def _get_embeddings():
    """Lazily load sentence-transformer embeddings."""
    global _embeddings
    if _embeddings is None:
        try:
            from langchain_community.embeddings import SentenceTransformerEmbeddings
            _embeddings = SentenceTransformerEmbeddings(
                model_name="all-MiniLM-L6-v2"
            )
            logger.info("[RAG] Sentence-transformer embeddings loaded.")
        except Exception as e:
            logger.error(f"[RAG] Failed to load embeddings: {e}")
            raise
    return _embeddings


def _get_groq_client():
    """Lazily initialise the Groq client."""
    global _groq_client
    if _groq_client is None:
        try:
            from groq import Groq
            api_key = os.environ.get("GROQ_API_KEY", "")
            if not api_key:
                raise EnvironmentError(
                    "GROQ_API_KEY is not set. Add it to your .env file."
                )
            _groq_client = Groq(api_key=api_key)
            logger.info("[RAG] Groq client initialised.")
        except ImportError:
            logger.warning("[RAG] groq package not installed. Run: pip install groq")
            raise
    return _groq_client


def _groq_answer(context: str, question: str) -> str:
    """
    Use Groq llama-4-scout to generate an answer grounded in the retrieved context.

    Args:
        context: Retrieved platform documentation snippets.
        question: User's question.

    Returns:
        A string answer from the LLM.
    """
    model = os.environ.get("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
    client = _get_groq_client()

    system_prompt = (
        "You are IndiaNext AI Assistant — a helpful, concise assistant for the IndiaNext "
        "federated learning platform. Answer the user's question using ONLY the context "
        "provided. If the context does not contain enough information, say so politely "
        "and suggest the user explore the dashboard. Keep answers under 150 words."
    )

    user_prompt = (
        f"Context from the platform knowledge base:\n{context}\n\n"
        f"Question: {question}"
    )

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            max_completion_tokens=512,
            top_p=1,
            stream=False,
            stop=None,
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"[RAG] Groq completion failed: {e}")
        raise


def _build_vectorstore(extra_docs: Optional[list] = None):
    """Build or load the ChromaDB vectorstore and index platform docs."""
    global _vectorstore, _retriever

    try:
        from langchain_community.vectorstores import Chroma
        from langchain.schema import Document

        persist_dir = os.path.join(
            os.path.dirname(__file__), "..", "chroma_db"
        )
        persist_dir = os.path.abspath(persist_dir)

        embeddings = _get_embeddings()

        all_texts = PLATFORM_DOCS.copy()
        if extra_docs:
            all_texts.extend(extra_docs)

        documents = [
            Document(page_content=text, metadata={"source": "platform_docs"})
            for text in all_texts
        ]

        _vectorstore = Chroma.from_documents(
            documents=documents,
            embedding=embeddings,
            persist_directory=persist_dir,
            collection_name="indianext_platform",
        )
        _vectorstore.persist()
        _retriever = _vectorstore.as_retriever(
            search_type="similarity", search_kwargs={"k": 4}
        )
        logger.info(
            f"[RAG] Vectorstore built with {len(documents)} docs at {persist_dir}"
        )
    except Exception as e:
        logger.error(f"[RAG] Vectorstore build failed: {e}")
        raise


def get_retriever(extra_docs: Optional[list] = None):
    """Get the global retriever, building it if needed."""
    global _retriever
    if _retriever is None:
        _build_vectorstore(extra_docs)
    return _retriever


def query_rag(question: str, extra_docs: Optional[list] = None) -> str:
    """
    Answer a question using RAG: retrieve relevant docs → generate with Groq llama-4-scout.

    Falls back through three levels:
      1. Groq LLM with retrieved context (preferred)
      2. Extractive answer from retrieved context (if Groq is unavailable)
      3. Hardcoded rule-based response (if vectorstore is also unavailable)

    Args:
        question: User's natural-language question.
        extra_docs: Optional extra documents to add to the store.

    Returns:
        A string answer.
    """
    # ── Level 1: full RAG with Groq LLM ─────────────────────────────────────
    try:
        retriever = get_retriever(extra_docs)
        relevant_docs = retriever.get_relevant_documents(question)

        if not relevant_docs:
            context = "\n\n".join(PLATFORM_DOCS[:3])
        else:
            context = "\n\n".join(doc.page_content for doc in relevant_docs)

        answer = _groq_answer(context, question)
        logger.info(f"[RAG] Groq answer generated for: '{question[:60]}'")
        return answer

    except EnvironmentError as env_err:
        # GROQ_API_KEY missing — fall through to extractive
        logger.warning(f"[RAG] Groq env error: {env_err}")
    except ImportError:
        logger.warning("[RAG] groq not installed — falling back to extractive.")
    except Exception as e:
        logger.warning(f"[RAG] Groq pipeline failed ({e}) — falling back to extractive.")

    # ── Level 2: extractive from vectorstore ─────────────────────────────────
    try:
        retriever = get_retriever(extra_docs)
        relevant_docs = retriever.get_relevant_documents(question)
        if relevant_docs:
            context = "\n\n".join(doc.page_content for doc in relevant_docs)
            return _extractive_answer(question, context)
    except Exception as e2:
        logger.warning(f"[RAG] Extractive fallback also failed: {e2}")

    # ── Level 3: hardcoded rule-based ────────────────────────────────────────
    return _rule_based_answer(question)


def _extractive_answer(question: str, context: str) -> str:
    """Simple extractive summarization — no LLM required."""
    sentences = []
    for para in context.split("\n\n"):
        sentences.extend([s.strip() for s in para.split(". ") if s.strip()])

    question_words = set(question.lower().split()) - {
        "how", "what", "when", "where", "why", "is", "are", "the", "a", "i", "do"
    }

    scored = []
    for sent in sentences:
        sent_words = set(sent.lower().split())
        overlap = len(question_words & sent_words)
        if overlap > 0:
            scored.append((overlap, sent))

    scored.sort(key=lambda x: x[0], reverse=True)
    if scored:
        return ". ".join(s for _, s in scored[:3]) + "."
    return context.split("\n\n")[0]


def _rule_based_answer(question: str) -> str:
    """Absolute last-resort rule-based response."""
    q = question.lower()
    if "train" in q:
        return "Upload a CSV dataset via the Dashboard to start training."
    if "federated" in q:
        return "Federated Learning trains models on local data and shares only weights."
    if "upload" in q:
        return "Upload .pt weight files via POST /fl/update or the Dashboard."
    if "dataset" in q or "kaggle" in q:
        return "Search datasets at GET /fl/datasets/search?q=computer+vision"
    if "experiment" in q or "mlflow" in q:
        return "View experiment history at GET /fl/experiments."
    if "leaderboard" in q:
        return "View the contributor leaderboard at /dashboard/leaderboard."
    return (
        "I'm the IndiaNext AI Assistant. Ask about: federated learning, "
        "model training, dataset discovery, experiments, or collaboration."
    )


def add_experiment_to_rag(
    experiment_id: str,
    contributor: str,
    dataset: str,
    accuracy: float,
    training_round: int,
):
    """
    Dynamically adds an experiment entry to the RAG knowledge base.
    Call this after each successful training round.
    """
    text = (
        f"Experiment {experiment_id}: Contributor '{contributor}' ran training on "
        f"dataset '{dataset}'. Accuracy achieved: {accuracy:.2%}. "
        f"Training round: {training_round}."
    )
    try:
        if _vectorstore is not None:
            from langchain.schema import Document
            doc = Document(
                page_content=text,
                metadata={"source": "experiment_history", "round": training_round},
            )
            _vectorstore.add_documents([doc])
            _vectorstore.persist()
            logger.info(f"[RAG] Experiment {experiment_id} added to vectorstore.")
    except Exception as e:
        logger.warning(f"[RAG] Failed to add experiment to vectorstore: {e}")
