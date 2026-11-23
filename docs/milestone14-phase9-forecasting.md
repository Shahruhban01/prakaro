# Phase 9 queue forecasting

The forecast uses actual routed cases from the preceding eight complete local weeks. Each case counts once in a given queue because the queue/task relationship is unique. One case can legitimately enter multiple queues, so queue forecasts are presented separately. Full prior days after the first recorded intake can contribute zero observations. Days before that first event are excluded because coverage is unknown.

For each future local date, the forecast averages historical counts for its weekday and requires four comparable observations. It shows sample count, forecast horizon, observed minimum and maximum, and the latest complete historical date. The range describes historical variability and is not a prediction interval. Where data is insufficient, the console states so and does not plot a complete forecast.

Full-day forecasts are for future local dates. Intervals including the current partial day do not use the full-day forecast against remaining capacity. Calendar buckets use the existing timezone conversion helpers rather than a fixed number of UTC hours.
