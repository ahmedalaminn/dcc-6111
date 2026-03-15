# AUTO-GENERATED stub — replace with output of:
#   protoc --python_out=. proto/log_message.proto
#
# Until proto compilation is set up, this module exposes a plain dataclass
# that mirrors the LogMessage schema so the rest of the app can import it
# without protoc being available on the dev machine.

from dataclasses import dataclass, field


@dataclass
class LogMessage:
    node_id:      str = ""
    timestamp_ms: int = 0
    payload:      str = ""
    topic:        str = ""

    # --- protobuf-compatible helpers ---
    def SerializeToString(self) -> bytes:
        """Minimal serialisation for testing (not real protobuf wire format)."""
        import json, time
        return json.dumps({
            "node_id":      self.node_id,
            "timestamp_ms": self.timestamp_ms or int(time.time() * 1000),
            "payload":      self.payload,
            "topic":        self.topic,
        }).encode()

    @classmethod
    def FromString(cls, data: bytes) -> "LogMessage":
        """Deserialise from the stub JSON encoding."""
        import json
        d = json.loads(data.decode())
        return cls(**d)
