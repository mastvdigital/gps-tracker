import asyncio
import json
import os
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="GPS Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

vehicles = {}

class VehicleData(BaseModel):
    id: str
    lat: float
    lng: float
    speed: float
    ignition: bool

@app.get("/api/vehicles")
def get_vehicles():
    return list(vehicles.values())

@app.get("/api/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: str):
    return vehicles.get(vehicle_id, {"error": "not found"})

@app.post("/api/vehicles")
def add_vehicle(data: VehicleData):
    vehicles[data.id] = data.model_dump()
    return {"status": "ok"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "gps":
                vehicles[msg["id"]] = {
                    "id": msg["id"],
                    "lat": msg["lat"],
                    "lng": msg["lng"],
                    "speed": msg["speed"],
                    "ignition": msg.get("ignition", True),
                    "updated": datetime.now().isoformat()
                }
                await websocket.send_text(json.dumps({
                    "type": "ack",
                    "id": msg["id"]
                }))
    except WebSocketDisconnect:
        pass

@app.websocket("/ws/live")
async def live_tracking(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_text(json.dumps({
                "type": "vehicles",
                "data": list(vehicles.values())
            }))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
