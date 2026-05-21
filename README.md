<div align="center">

<br/>

![RITA.AI](https://raw.githubusercontent.com/Bukhhh/rita-local-ai/main/frontend/public/logo.png)

<br/>

# RITA.AI

### *Retrieval Intelligence & Trusted Automation*

**A sovereign AI platform by [Hypepresso](https://hypepresso.com) — built for organisations that cannot afford to compromise on data privacy.**

<br/>

[![Built on AnythingLLM](https://img.shields.io/badge/Built%20on-AnythingLLM-6366f1?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/Mintplex-Labs/anything-llm)
[![Powered by Ollama](https://img.shields.io/badge/Powered%20by-Ollama-0f172a?style=for-the-badge&logo=nvidia&logoColor=white)](https://ollama.com)
[![Edge AI](https://img.shields.io/badge/Edge%20AI-NVIDIA%20Jetson-76b900?style=for-the-badge&logo=nvidia&logoColor=white)](https://developer.nvidia.com/embedded/jetson-orin)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Made in Malaysia](https://img.shields.io/badge/Made%20in-Malaysia%20🇲🇾-cc0001?style=for-the-badge)](https://hypepresso.com)

<br/>

> **"Your data never leaves the box."**

<br/>

---

</div>

## What is RITA?

**RITA** *(Retrieval Intelligence & Trusted Automation)* is Hypepresso's flagship **private AI appliance** — a fully offline, enterprise-grade AI platform that runs entirely on dedicated edge hardware.

No cloud. No API keys. No subscription to foreign AI providers. Just raw intelligence, on-premise, under your full control.

RITA is purpose-built for organisations operating in high-trust environments — where confidential documents, proprietary data, and sensitive communications must never leave the building.

<br/>

---

## Why RITA Exists

Most AI platforms today require your data to travel to external servers for processing. For law firms, healthcare providers, government agencies, and financial institutions — **that is simply not an option.**

RITA was engineered to close that gap.

| The Problem | The RITA Solution |
|---|---|
| Data sent to cloud providers | Everything processed on-device |
| API keys & third-party dependencies | Zero external dependencies |
| Subscription lock-in | One-time hardware + service model |
| Complex setup for non-technical teams | Plug-in, connect to LAN, go |
| Generic AI with no domain focus | Customisable per organisation |

<br/>

---

## Core Capabilities

```
┌─────────────────────────────────────────────────────┐
│                    RITA PLATFORM                     │
│                                                      │
│  📄 Document Intelligence                            │
│     Upload PDFs, Word docs, spreadsheets & more      │
│     Ask questions in plain language                  │
│                                                      │
│  🔒 Zero-Trust Architecture                          │
│     100% offline — air-gapped capable                │
│     No telemetry, no cloud calls                     │
│                                                      │
│  📊 Data Visualisation                               │
│     Ask for charts — get charts                      │
│     Bar, line, pie, scatter — rendered in-chat       │
│                                                      │
│  🏢 Multi-Workspace                                  │
│     Separate knowledge bases per department          │
│     Role-based access control                        │
│                                                      │
│  🤖 Local LLM Engine                                 │
│     Llama 3.1 · Mistral · Phi-3 · Gemma 2            │
│     Runs on NVIDIA CUDA — no GPU cloud needed        │
└─────────────────────────────────────────────────────┘
```

<br/>

---

## Hardware Pairing

RITA is designed and optimised to ship as a **physical AI appliance** powered by NVIDIA Jetson edge computing hardware.

| Device | AI Performance | Recommended Model | Best For |
|---|---|---|---|
| **Jetson Orin Nano 8GB** | 40 TOPS | Llama 3.1 8B / Mistral 7B | SME, small teams |
| **Jetson Orin Nano 16GB** | 67 TOPS | Gemma 2 9B / Llama 3.1 8B | Mid-size departments |
| **Jetson Orin NX 16GB** | 100 TOPS | Llama 3.1 13B | Enterprise, heavy usage |
| **Jetson AGX Orin** | 275 TOPS | 30B+ models | Research, large orgs |

> RITA can also be deployed on any x86/ARM server with a compatible NVIDIA GPU via Docker.

<br/>

---

## Tech Stack

```
[ Browser — any device on local network ]
              │
              │ HTTP (LAN only — zero internet)
              ▼
[ RITA Platform — React UI + Node.js API ]
              │                    │
       Ollama API             LanceDB (local)
              │
[ Ollama — serves quantised LLMs on-device ]
              │
[ NVIDIA Jetson GPU — CUDA inference engine ]
```

| Layer | Technology | Licence |
|---|---|---|
| UI / Application | RITA (forked from AnythingLLM) | MIT |
| LLM Runtime | Ollama | MIT |
| Vector Database | LanceDB | Apache 2.0 |
| Container | Docker | Apache 2.0 |
| OS | Ubuntu 22.04 + JetPack | Open |
| AI Models | Llama 3.1, Mistral, Phi-3, Gemma 2 | Various (commercial OK) |

<br/>

---

## Getting Started

### Prerequisites
- Node.js 18 LTS
- Python 3.10+
- Docker (for deployment)
- Ollama installed and running

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Bukhhh/rita-local-ai.git
cd rita-local-ai

# Install dependencies
cd server && npm install --legacy-peer-deps && cd ..
cd frontend && npm install --legacy-peer-deps && cd ..

# Configure environment
cp server/.env.example server/.env
cp frontend/.env.example frontend/.env

# Run database migrations
cd server && npx prisma db push && cd ..
```

### Start Development Server

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open your browser at `http://localhost:3000`

### Pull a Local Model via Ollama

```bash
# Recommended for Jetson Orin Nano 8GB
ollama pull llama3.1:8b

# Lighter option
ollama pull phi3:mini

# Best document understanding
ollama pull mistral:7b
```

<br/>

---

## Deployment on Jetson

```bash
# Build ARM64 Docker image
docker buildx build \
  --platform linux/arm64 \
  -t rita-ai:latest \
  -f docker/Dockerfile .

# Deploy on Jetson
docker run -d \
  --name rita-ai \
  --restart always \
  --gpus all \
  -p 3001:3001 \
  rita-ai:latest
```

Access RITA from any browser on the local network:
```
http://<jetson-ip>:3001
```

<br/>

---

## Target Industries

RITA is built for sectors where data privacy is non-negotiable:

- ⚖️ **Legal** — privileged client communications & case documents
- 🏥 **Healthcare** — patient records, clinical data (PDPA compliant)
- 🏛️ **Government** — classified internal knowledge bases
- 🏦 **Finance & Accounting** — sensitive financial data & audits
- 🏭 **Manufacturing** — trade secrets, product specifications
- 🎓 **Education** — institutional research & administrative data

<br/>

---

## Roadmap

- [x] Core platform setup & dependency resolution
- [x] White-labelled branding (RITA by Hypepresso)
- [x] Local LLM integration via Ollama
- [ ] Prisma database migration & full server stability
- [ ] Graph & chart generation from document data
- [ ] ARM64 Docker image for Jetson deployment
- [ ] Custom system prompt templates per workspace
- [ ] Multi-user access control for enterprise
- [ ] Offline update mechanism via LAN/USB

<br/>

---

## About Hypepresso

**[Hypepresso](https://hypepresso.com)** is a Malaysian technology company specialising in AI product development, edge computing solutions, and enterprise automation.

RITA represents our commitment to making powerful AI accessible to organisations that prioritise sovereignty over their data — without sacrificing capability.

> *Built in Malaysia 🇲🇾 · Trusted by enterprises · Powered by open-source*

<br/>

---

## Acknowledgements

RITA is built on top of the outstanding work by the open-source community:

- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) by Mintplex Labs — MIT Licence
- [Ollama](https://github.com/ollama/ollama) — MIT Licence
- [LanceDB](https://github.com/lancedb/lancedb) — Apache 2.0
- [Llama 3.1](https://llama.meta.com) by Meta AI
- [Mistral](https://mistral.ai) by Mistral AI

<br/>

---

<div align="center">

**RITA.AI** · Built by [Hypepresso](https://hypepresso.com) · Malaysia 🇲🇾

*Private AI. Real Intelligence. Total Control.*

</div>
