FROM python:3.12-slim

# Install uv
RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy project files
COPY pyproject.toml ./
COPY haggle_tee/ ./haggle_tee/

# Install production dependencies only
RUN uv pip install --system --no-cache-dir .

# Keys directory (mounted at runtime in TEE; generated on first start if missing)
RUN mkdir -p keys

EXPOSE 8080

CMD ["uvicorn", "haggle_tee.server:app", "--host", "0.0.0.0", "--port", "8080"]
