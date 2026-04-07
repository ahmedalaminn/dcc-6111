# Multi-arch image — works on both x86-64 and ARM (BeagleBone Black).
# Build for BBB:  docker build --platform linux/arm/v7 -t waveform-monitor .
FROM python:3.11-slim

WORKDIR /app

# Install build deps for numpy/scipy on ARM (no pre-built wheels for armv7l)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ gfortran libopenblas-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data/raw data/metrics data/comparisons data/reports

EXPOSE 8000

# Resource-conscious defaults for BBB (512MB RAM)
ENV MAX_SAMPLES=200000
ENV MAX_FILE_SIZE_MB=100

CMD ["python", "app/main.py"]
