FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application. Committed data (schema/, seed/) lives at the repo root
# alongside the importable filmgraph/ package.
COPY . .

EXPOSE 8000

CMD ["uvicorn", "filmgraph.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
