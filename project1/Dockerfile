FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data/raw data/metrics data/comparisons data/reports

EXPOSE 8000

CMD ["python", "app/main.py"]
