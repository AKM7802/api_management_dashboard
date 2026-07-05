"""Optional static model->price map (USD per 1M tokens). Unknown models cost 0.

Purely for nicer dashboard charts; not billing. Keyed by model name alone —
registering an API never declares a provider, so pricing is looked up
straight from whatever model name the upstream's response reports.
"""

# (input_per_1m, output_per_1m)
PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-opus-4-8": (15.00, 75.00),
    "claude-haiku-4-5-20251001": (1.00, 5.00),
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    in_price, out_price = PRICES.get(model, (0.0, 0.0))
    return (prompt_tokens / 1_000_000) * in_price + (
        completion_tokens / 1_000_000
    ) * out_price
