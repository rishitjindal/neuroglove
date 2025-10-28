import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Hand, Radio, Settings as SettingsIcon, MessageSquare, Activity, Wifi, WifiOff, Fingerprint } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import Chatbot from '@/components/Chatbot';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Finger names for display
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

function Dashboard({ user, onLogout }) {
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [sensorData, setSensorData] = useState([]);
  const [showChatbot, setShowChatbot] = useState(false);
  const [bluetoothDevice, setBluetoothDevice] = useState(null);
  const [currentFlexValues, setCurrentFlexValues] = useState({
    thumb: 0,
    index: 0,
    middle: 0,
    ring: 0,
    pinky: 0
  });

  useEffect(() => {
    loadDevices();
    loadSensorData();
  }, []);

  const loadDevices = async () => {
    try {
      const response = await axios.get(`${API}/devices`, { withCredentials: true });
      setDevices(response.data.devices || []);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadSensorData = async () => {
    try {
      if (connectedDevice) {
        const response = await axios.get(`${API}/sensor-data/${connectedDevice.id}`, { 
          withCredentials: true 
        });
        setSensorData(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to load sensor data:', error);
    }
  };

  const scanForDevices = async () => {
    try {
      if (!navigator.bluetooth) {
        toast.error('Web Bluetooth API is not available in your browser. Please use Chrome, Edge, or Opera.');
        return;
      }

      setScanning(true);
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information', 'generic_access']
      });

      // Save device to backend
      await axios.post(
        `${API}/devices`,
        {
          device_id: device.id,
          device_name: device.name || 'NeuroGlove Device'
        },
        { withCredentials: true }
      );

      toast.success(`Found device: ${device.name || 'NeuroGlove Device'}`);
      loadDevices();
      
      // Connect to device
      connectToDevice(device);
    } catch (error) {
      if (error.name === 'NotFoundError') {
        toast.info('No device selected');
      } else {
        toast.error('Failed to scan for devices: ' + error.message);
      }
      console.error('Bluetooth scan error:', error);
    } finally {
      setScanning(false);
    }
  };

  const connectToDevice = async (device) => {
    try {
      const server = await device.gatt.connect();
      setBluetoothDevice(device);
      setConnectedDevice({
        id: device.id,
        name: device.name || 'NeuroGlove Device'
      });
      toast.success('Connected to NeuroGlove!');

      // Simulate flex sensor data for demo (replace with actual characteristic reading)
      startSimulatedFlexData(device.id);
      
    } catch (error) {
      toast.error('Failed to connect to device');
      console.error('Connection error:', error);
    }
  };

  // Simulate flex sensor readings (replace with actual Bluetooth characteristic reading)
  const startSimulatedFlexData = (deviceId) => {
    const interval = setInterval(() => {
      // Generate random flex values (0-100) for each finger
      const flexData = {
        thumb: Math.floor(Math.random() * 100),
        index: Math.floor(Math.random() * 100),
        middle: Math.floor(Math.random() * 100),
        ring: Math.floor(Math.random() * 100),
        pinky: Math.floor(Math.random() * 100),
        timestamp: new Date().toISOString()
      };

      setCurrentFlexValues(flexData);

      // Save to backend
      axios.post(`${API}/sensor-data`, {
        device_id: deviceId,
        data: flexData
      }, { withCredentials: true });

      // Update local state
      setSensorData(prev => [flexData, ...prev.slice(0, 49)]);
    }, 1000); // Update every second

    // Store interval ID to clear on disconnect
    if (bluetoothDevice) {
      bluetoothDevice.intervalId = interval;
    }
  };

  const disconnectDevice = () => {
    if (bluetoothDevice) {
      if (bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
      }
      if (bluetoothDevice.intervalId) {
        clearInterval(bluetoothDevice.intervalId);
      }
      setBluetoothDevice(null);
      setConnectedDevice(null);
      setCurrentFlexValues({ thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 });
      toast.info('Device disconnected');
    }
  };

  const getFlexColor = (value) => {
    if (value < 30) return 'bg-green-500';
    if (value < 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className=\"min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50\">
      {/* Header */}
      <nav className=\"bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm\">
        <div className=\"max-w-7xl mx-auto px-8 py-4\">
          <div className=\"flex justify-between items-center\">
            <div className=\"flex items-center space-x-3\">
              <div className=\"w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-xl flex items-center justify-center shadow-lg\">
                <Hand className=\"w-6 h-6 text-white\" />
              </div>
              <div>
                <span className=\"text-2xl font-bold bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent\">NeuroGlove</span>
                <p className=\"text-xs text-gray-600 -mt-1\">Monitor & Control</p>
              </div>
            </div>

            <div className=\"flex items-center space-x-4\">
              <Button
                variant=\"outline\"
                size=\"sm\"
                onClick={() => setShowChatbot(!showChatbot)}
                data-testid=\"chatbot-toggle-btn\"
                className=\"border-emerald-200 hover:bg-emerald-50\"
              >
                <MessageSquare className=\"w-4 h-4 mr-2\" />
                AI Assistant
              </Button>
              <Link to=\"/settings\">
                <Button variant=\"outline\" size=\"sm\" data-testid=\"settings-btn\" className=\"border-emerald-200 hover:bg-emerald-50\">
                  <SettingsIcon className=\"w-4 h-4 mr-2\" />
                  Settings
                </Button>
              </Link>
              <Button variant=\"outline\" size=\"sm\" onClick={onLogout} data-testid=\"logout-btn\">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className=\"max-w-7xl mx-auto px-8 py-8\">
        {/* Welcome Section */}
        <div className=\"mb-8\">
          <h1 className=\"text-4xl font-bold text-gray-900 mb-2\">Welcome back, {user?.name || 'User'}!</h1>
          <p className=\"text-gray-600\">Monitor your NeuroGlove flex sensors and gesture signals in real-time</p>
        </div>

        {/* Main Content */}
        <div className=\"grid lg:grid-cols-3 gap-8\">
          {/* Device Scanner */}
          <div className=\"lg:col-span-2 space-y-6\">
            <Card className=\"border-0 shadow-xl\" data-testid=\"bluetooth-scanner-card\">
              <CardHeader>
                <CardTitle className=\"flex items-center\">
                  <Radio className=\"w-5 h-5 mr-2 text-emerald-600\" />
                  NeuroGlove Scanner
                </CardTitle>
                <CardDescription>
                  Pair your NeuroGlove device via Bluetooth
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className=\"space-y-4\">
                  <Button
                    onClick={scanForDevices}
                    disabled={scanning}
                    className=\"w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-lg\"
                    data-testid=\"scan-devices-btn\"
                  >
                    {scanning ? (
                      <>
                        <div className=\"animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2\"></div>
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Hand className=\"w-4 h-4 mr-2\" />
                        Scan for NeuroGlove
                      </>
                    )}
                  </Button>

                  {connectedDevice && (
                    <div className=\"p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl shadow-sm\">
                      <div className=\"flex items-center justify-between\">
                        <div className=\"flex items-center space-x-3\">
                          <div className=\"w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center pulse-ring\">
                            <Wifi className=\"w-6 h-6 text-white\" />
                          </div>
                          <div>
                            <p className=\"font-semibold text-gray-900\" data-testid=\"connected-device-name\">{connectedDevice.name}</p>
                            <p className=\"text-sm text-emerald-600 font-medium\">Connected & Active</p>
                          </div>
                        </div>
                        <Button
                          variant=\"outline\"
                          size=\"sm\"
                          onClick={disconnectDevice}
                          data-testid=\"disconnect-btn\"
                          className=\"border-red-200 text-red-600 hover:bg-red-50\"
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Flex Sensor Visualization */}
            <Card className=\"border-0 shadow-xl\" data-testid=\"flex-sensor-card\">
              <CardHeader>
                <CardTitle className=\"flex items-center\">
                  <Fingerprint className=\"w-5 h-5 mr-2 text-teal-600\" />
                  Flex Sensor Readings
                </CardTitle>
                <CardDescription>
                  Real-time finger bend detection (0-100 scale)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!connectedDevice ? (
                  <div className=\"text-center py-12 text-gray-500\">
                    <Hand className=\"w-16 h-16 mx-auto mb-3 opacity-30\" />
                    <p className=\"font-medium\">No device connected</p>
                    <p className=\"text-sm\">Connect your NeuroGlove to see live flex data</p>
                  </div>
                ) : (
                  <div className=\"space-y-4\">
                    {Object.entries(currentFlexValues).filter(([key]) => key !== 'timestamp').map(([finger, value], index) => (
                      <div key={finger} className=\"space-y-2\">
                        <div className=\"flex justify-between items-center\">
                          <span className=\"text-sm font-semibold text-gray-700 capitalize\">{FINGERS[index]}</span>
                          <span className=\"text-sm font-bold text-gray-900\">{value}%</span>
                        </div>
                        <div className=\"relative h-8 bg-gray-100 rounded-full overflow-hidden\">
                          <div 
                            className={`absolute left-0 top-0 h-full ${getFlexColor(value)} transition-all duration-300 rounded-full flex items-center justify-end pr-2`}
                            style={{ width: `${value}%` }}
                          >
                            {value > 10 && <span className=\"text-xs font-bold text-white\">{value}%</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Signal History */}
            <Card className=\"border-0 shadow-xl\" data-testid=\"sensor-data-card\">
              <CardHeader>
                <CardTitle className=\"flex items-center\">
                  <Activity className=\"w-5 h-5 mr-2 text-cyan-600\" />
                  Signal History
                </CardTitle>
                <CardDescription>
                  Previous flex sensor readings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sensorData.length === 0 ? (
                  <div className=\"text-center py-8 text-gray-500\">
                    <Activity className=\"w-12 h-12 mx-auto mb-3 opacity-30\" />
                    <p>No signal data available</p>
                    <p className=\"text-sm\">Connect a device to see history</p>
                  </div>
                ) : (
                  <div className=\"space-y-3 max-h-96 overflow-y-auto\">
                    {sensorData.map((data, index) => (
                      <div key={index} className=\"p-4 bg-gradient-to-r from-gray-50 to-teal-50 rounded-lg border border-gray-200\" data-testid={`sensor-data-item-${index}`}>
                        <div className=\"flex justify-between items-start mb-2\">
                          <p className=\"text-xs text-gray-500\">
                            {new Date(data.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                        <div className=\"grid grid-cols-5 gap-2\">
                          {Object.entries(data).filter(([key]) => key !== 'timestamp').map(([finger, value]) => (
                            <div key={finger} className=\"text-center\">
                              <div className=\"text-xs text-gray-600 capitalize mb-1\">{finger.slice(0, 3)}</div>
                              <div className={`px-2 py-1 rounded text-xs font-bold text-white ${getFlexColor(value)}`}>
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Saved Devices */}
          <div>
            <Card className=\"border-0 shadow-xl\" data-testid=\"saved-devices-card\">
              <CardHeader>
                <CardTitle>Saved Devices</CardTitle>
                <CardDescription>
                  Previously paired NeuroGloves
                </CardDescription>
              </CardHeader>
              <CardContent>
                {devices.length === 0 ? (
                  <div className=\"text-center py-8 text-gray-500\">
                    <WifiOff className=\"w-12 h-12 mx-auto mb-3 opacity-30\" />
                    <p className=\"text-sm\">No devices saved yet</p>
                  </div>
                ) : (
                  <div className=\"space-y-3\">
                    {devices.map((device) => (
                      <div
                        key={device.id}
                        className=\"p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg hover:shadow-md transition-all border border-emerald-100\"
                        data-testid={`saved-device-${device.device_id}`}
                      >
                        <div className=\"flex items-center space-x-3\">
                          <div className=\"w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-sm\">
                            <Hand className=\"w-5 h-5 text-white\" />
                          </div>
                          <div className=\"flex-1 min-w-0\">
                            <p className=\"font-medium text-gray-900 truncate\">{device.device_name}</p>
                            <p className=\"text-xs text-gray-500\">
                              {new Date(device.connected_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Chatbot Modal */}
      {showChatbot && <Chatbot onClose={() => setShowChatbot(false)} user={user} />}
    </div>
  );
}

export default Dashboard;
