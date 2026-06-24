import asyncio
import json
import random
import math
import websockets

VEHICLES = [
    {"id": "Veh-001", "lat": 19.4326, "lng": -99.1332, "angle": 0},
    {"id": "Veh-002", "lat": 19.4200, "lng": -99.1500, "angle": 90},
    {"id": "Veh-003", "lat": 19.4450, "lng": -99.1200, "angle": 180},
    {"id": "Veh-004", "lat": 19.4100, "lng": -99.1450, "angle": 270},
    {"id": "Veh-005", "lat": 19.4380, "lng": -99.1100, "angle": 45},
]

async def simulate():
    uri = "ws://localhost:8000/ws"
    async with websockets.connect(uri) as ws:
        while True:
            for v in VEHICLES:
                v["angle"] += random.uniform(-10, 10)
                speed = random.uniform(0, 80)
                dist = speed / 3600 * 0.01
                v["lat"] += math.cos(math.radians(v["angle"])) * dist
                v["lng"] += math.sin(math.radians(v["angle"])) * dist

                msg = {
                    "type": "gps",
                    "id": v["id"],
                    "lat": round(v["lat"], 6),
                    "lng": round(v["lng"], 6),
                    "speed": round(speed, 1),
                    "ignition": speed > 1,
                }
                await ws.send(json.dumps(msg))
                await asyncio.sleep(0.5)
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(simulate())
