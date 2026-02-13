"""Configuration for the LLM Council."""

import os
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Council members - list of OpenRouter model identifiers
COUNCIL_MODELS = [
    
#Paid Models    

    #"openai/gpt-5.1",
    #"google/gemini-3-pro-preview",
    #"anthropic/claude-sonnet-4.5",
    # "x-ai/grok-4",

#Free Models
    "tngtech/deepseek-r1t2-chimera:free",
    "x-ai/grok-4.1-fast:free",
]

# Chairman model - synthesizes final response
CHAIRMAN_MODEL = "x-ai/grok-4.1-fast"

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"
