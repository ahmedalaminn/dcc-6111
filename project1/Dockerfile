# Multi-arch image — works on both x86-64 and ARM (BeagleBone Black).
# Build for BBB: docker build --platform linux/arm/v7 -t waveform-monitor .
#
# The BBB-friendly runtime no longer depends on SciPy, so we avoid the large
# Fortran/OpenBLAS toolchain that previously bloated build time and image size.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data/raw data/metrics data/comparisons data/reports

EXPOSE 8000

# Resource-conscious defaults for BBB (512MB RAM)
ENV MAX_SAMPLES=200000
ENV MAX_FFT_SAMPLES=131072
ENV MAX_ALIGNMENT_SAMPLES=50000
ENV MAX_COMPARE_SAMPLES=50000
ENV MAX_FILE_SIZE_MB=64

CMD ["python", "app/main.py"]
