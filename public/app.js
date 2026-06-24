const map = L.map('map').setView([19.4326, -99.1332], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

const markers = {};
const paths = {};
const vehicleTrail = {};

const vehicleIcons = {
    default: L.divIcon({
        html: '<div style="width:14px;height:14px;background:#00d4ff;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px #00d4ff;"></div>',
        iconSize: [14, 14],
        className: ''
    }),
    active: L.divIcon({
        html: '<div style="width:16px;height:16px;background:#4ecca3;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px #4ecca3;"></div>',
        iconSize: [16, 16],
        className: ''
    })
};

const socket = io();

socket.on('vehicles', (vehicles) => {
    updateVehicles(vehicles);
});

function updateVehicles(vehicles) {
    const list = document.getElementById('vehicle-list');

    vehicles.forEach(v => {
        if (!vehicleTrail[v.id]) {
            vehicleTrail[v.id] = [];
        }
        vehicleTrail[v.id].push([v.lat, v.lng]);
        if (vehicleTrail[v.id].length > 50) {
            vehicleTrail[v.id].shift();
        }

        const icon = v.speed > 0 ? vehicleIcons.active : vehicleIcons.default;

        if (markers[v.id]) {
            markers[v.id].setLatLng([v.lat, v.lng]);
            markers[v.id].setIcon(icon);
        } else {
            markers[v.id] = L.marker([v.lat, v.lng], { icon }).addTo(map)
                .bindPopup(`<b>${v.id}</b><br>Speed: ${v.speed} km/h`);
        }

        if (paths[v.id]) {
            map.removeLayer(paths[v.id]);
        }
        if (vehicleTrail[v.id].length > 1) {
            paths[v.id] = L.polyline(vehicleTrail[v.id], {
                color: v.speed > 0 ? '#4ecca3' : '#00d4ff',
                weight: 2,
                opacity: 0.6
            }).addTo(map);
        }

        const card = document.createElement('div');
        card.className = 'vehicle-card';
        card.innerHTML = `
            <div class="name">${v.id}</div>
            <div class="info">
                Speed: <span class="speed">${v.speed} km/h</span><br>
                Ignition: <span class="${v.ignition ? 'ignition-on' : 'ignition-off'}">${v.ignition ? 'ON' : 'OFF'}</span><br>
                Lat: ${v.lat.toFixed(4)}, Lng: ${v.lng.toFixed(4)}
            </div>
        `;
        card.onclick = () => {
            map.setView([v.lat, v.lng], 15);
            if (markers[v.id]) markers[v.id].openPopup();
        };

        const existing = list.querySelector(`[data-id="${v.id}"]`);
        if (existing) {
            existing.replaceWith(card);
        } else {
            list.appendChild(card);
        }
        card.setAttribute('data-id', v.id);
    });
}
