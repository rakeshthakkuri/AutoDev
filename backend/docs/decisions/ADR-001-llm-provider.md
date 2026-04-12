# ADR-001: LLM Provider Strategy

## Status: In Progress

## Context: llm.js currently implements Gemini only. config.js previously documented openai/anthropic keys that had no runtime effect.

## Decision: Remove phantom config keys. Implement multi-provider abstraction in Phase 1 Task 1.3.

## Consequence: Engineers will not waste time debugging why OPENAI_API_KEY has no effect.
