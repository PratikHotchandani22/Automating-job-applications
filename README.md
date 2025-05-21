# Automating Job Applications

A Streamlit‐powered assistant that matches your resumes to live job postings, generates tailored cover letters, and drafts recruiter outreach—all in one click.

---

## 📌 Project Overview

The app orchestrates a full **LLM + RAG** workflow:

1. **Resume Intake** – Parse uploaded or Supabase‐hosted résumés; extract entities and generate vector embeddings.
2. **Job Scraping / Input** – Pull descriptions directly from supported URLs (Glassdoor) **or** accept pasted text.
3. **Job‐Resume Matching** – Compare embeddings to rank best résumé; optional extra RAG snippets boost relevance.
4. **LLM Reasoning** – Identify role requirements, summarise posting, and suggest résumé tweaks.
5. **Collateral Generation**
   * Targeted cover letter
   * LinkedIn/Email messages for recruiter & hiring manager
   * Cold outreach templates
6. **Storage & Retrieval** – Persist résumés, job info, embeddings, and RAG data to Supabase for reuse.

Everything runs inside a single asynchronous Streamlit session, backed by OpenAI, Anthropic, or LiteLLM‐served models.

---

## 🏗️ Architecture

```
┌──────┐  resumes  ┌────────┐   emb   ┌──────────┐
│User │──────────▶│ Parser │────────▶│Supabase │
└──────┘           └────────┘        └──────────┘
     ▲                                  ▲
     │                                  │fetch
     │           match + suggest        │
     │        ┌─────────LLMs─────────┐ │
     │        │  OpenAI / Anthropic  │ │
     │        └─────────▲────────────┘ │
     │                  │              │
job URL / text          │              │rag/extra info
     │                  │              │
     ▼                  │              ▼
┌────────┐ scrape │  ┌─────────┐  embeddings ┌─────────┐
│Scraper │─────────▶│ Job Info │───────────▶│ RAG     │
└────────┘           └─────────┘            └─────────┘
```

---

## 🛠️ Key Technologies

| Domain | Stack |
| ------ | ----- |
| UI | **Streamlit**, **asyncio** session state |
| LLM Providers | OpenAI GPT‐4o, Anthropic Claude 3, LiteLLM router |
| Embeddings | **sentence‐transformers**, OpenAI *text‐embedding‐3* |
| Data Store | **Supabase** (PostgreSQL + storage) |
| Scraping | **crawl4ai** wrappers, BeautifulSoup |
| NLP Parsing | Custom prompts + **LangChain** routers |

---

## 📂 Directory Structure

```
.
├── main.py                        # Streamlit entry‐point
├── configuration.py               # Prompts, model IDs, constants
├── helper_functions.py            # UI & utility helpers
├── get_job_details_crawl4ai.py    # Job‐description scraper
├── prompt_*                       # LLM call wrappers (OpenAI, Anthropic, LiteLLM)
├── create_embeddings.py           # Embedding helpers
├── supabase_backend.py            # Async Supabase client
├── supabase_helper_functions.py   # Data‐prep for DB tables
└── README.md                      # (this file)
```

---

## ⚙️ Configuration

1. Copy `.env.example` ➜ `.env` and set:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

2. Adjust default prompts / model names in `configuration.py` if desired.

---

## 🚀 Quick Start

```
# Python 3.10+
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

streamlit run main.py
```

Open browser at the prompted localhost URL and follow the UI steps:
1. Select or upload résumés.
2. Paste job URL or description.
3. Tick **Cover Letter**, **Reach‐out Messages**, or **Generate All**.
4. Click **Analyze** to receive matches, suggestions, and downloads.

---

## 📝 Supabase Schema (core)

| Table | Purpose |
| ----- | ------- |
| `resume_data` | Résumé text + embeddings |
| `job_info` | Job description + embeddings |
| `extra_info` | User‐added RAG snippets |
| `application_outputs` | Cover letters & messages |

---

## ✅ Testing

```
pytest tests/ -q
```

Mocks external LLM calls using LiteLLM replay.

---

## 🤝 Contributing

* Issue / PR welcome—please follow Conventional Commits.
* Run `pre‐commit run ‐‐all-files` before pushing.

---

## 📄 License

MIT — see `LICENSE` for full terms.

---

## 🙏 Acknowledgements

* Streamlit community for rapid UI tooling.
* Supabase for the generous free tier.
* OpenAI, Anthropic, and the OSS LLM ecosystem for continual innovation.
