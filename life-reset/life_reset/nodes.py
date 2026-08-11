"""The model boundary.

Everything that talks to a model goes through the tiny `complete(system, user)`
interface below, and nothing else in this package imports `anthropic`. That is
deliberate: `program.py`, `catalog.py` and the whole of `eval_harness.py` run
under plain Python with no key and no network, which is what makes 2,000
synthetic users across 66 days a test rather than a bill.

    from life_reset.nodes import AnthropicLLM
    llm = AnthropicLLM()                       # Architect: one call per user, ever
    small = AnthropicLLM(model="claude-haiku-4-5")   # Adaptation / Companion

Install the SDK only if you want the `--live` paths:

    pip install anthropic
"""

from __future__ import annotations

from typing import Protocol

try:
    from anthropic import Anthropic
except ImportError as exc:  # pragma: no cover - only hit without the SDK
    raise ImportError(
        "life_reset.nodes needs the Anthropic SDK: pip install anthropic\n"
        "The deterministic core (catalog, program, agents with llm=None) does not."
    ) from exc


class LLM(Protocol):
    def complete(self, system: str, user: str) -> str: ...


class AnthropicLLM:
    """One call in, one string out.

    Deliberately not a chat client: every agent in this system is a single
    stateless request whose answer is validated and repaired in code, so a
    conversation object would be state nobody reads.

    @param model    `claude-opus-5` for the Architect — it runs once per user and
                    picks the habits every later day is built on. Pass a smaller
                    model for Adaptation and the Companion, which run often and
                    choose from a handful of fixed operations.
    @param effort   How hard to think. `high` suits the Architect; drop to
                    `medium` or `low` for the frequent, narrower calls.
    """

    def __init__(
        self,
        model: str = "claude-opus-5",
        max_tokens: int = 16000,
        effort: str = "high",
    ) -> None:
        # Credentials resolve from the environment (ANTHROPIC_API_KEY, or a
        # profile from `ant auth login`) — never passed in or held here.
        self._client = Anthropic()
        self.model = model
        self.max_tokens = max_tokens
        self.effort = effort

    def complete(self, system: str, user: str) -> str:
        response = self._client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system,
            output_config={"effort": self.effort},
            messages=[{"role": "user", "content": user}],
        )

        # Check before reading content: a declined request returns a normal 200
        # with an empty or partial `content`, so indexing straight into it is
        # how this would crash in production rather than in a test. Returning
        # "" lets the caller fall back — `build_program` ships the fallback
        # programme, `adapt_program` softens the worst habit — which is the
        # whole reason those paths exist.
        if response.stop_reason == "refusal":
            return ""

        return "".join(block.text for block in response.content if block.type == "text")
