import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bluetooth, Radio, Settings as SettingsIcon, MessageSquare, Activity, Wifi, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import Chatbot from '@/components/Chatbot';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Dashboard({ user, onLogout }) {
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [sensorData, setSensorData] = useState([]);
  const [showChatbot, setShowChatbot] = useState(false);
  const [bluetoothDevice, setBluetoothDevice] = useState(null);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const response = await axios.get(`${API}/devices`, { withCredentials: true });
      setDevices(response.data.devices || []);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const scanForDevices = async () => {
    try {
      if (!navigator.bluetooth) {
        toast.error('Web Bluetooth API is not available in your browser');
        return;
      }

      setScanning(true);
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information']
      });

      // Save device to backend
      await axios.post(
        `${API}/devices`,
        {
          device_id: device.id,
          device_name: device.name || 'Unknown Device'
        },
        { withCredentials: true }
      );

      toast.success(`Found device: ${device.name || 'Unknown Device'}`);
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
        name: device.name || 'Unknown Device'
      });
      toast.success('Connected to device!');

      // Try to read battery level
      try {
        const batteryService = await server.getPrimaryService('battery_service');
        const batteryCharacteristic = await batteryService.getCharacteristic('battery_level');
        const value = await batteryCharacteristic.readValue();
        const batteryLevel = value.getUint8(0);
        
        // Save sensor data
        const sensorDataPayload = {
          device_id: device.id,
          data: {
            type: 'battery',
            battery_level: batteryLevel,
            timestamp: new Date().toISOString()
          }
        };
        
        await axios.post(`${API}/sensor-data`, sensorDataPayload, { withCredentials: true });
        setSensorData(prev => [sensorDataPayload.data, ...prev]);
        
        // Start monitoring
        batteryCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
          const newValue = event.target.value.getUint8(0);
          const newData = {
            type: 'battery',
            battery_level: newValue,
            timestamp: new Date().toISOString()
          };
          setSensorData(prev => [newData, ...prev.slice(0, 19)]);
          axios.post(`${API}/sensor-data`, {
            device_id: device.id,
            data: newData
          }, { withCredentials: true });
        });
        
        await batteryCharacteristic.startNotifications();
      } catch (err) {
        console.log('Could not read battery service:', err);
      }
    } catch (error) {
      toast.error('Failed to connect to device');
      console.error('Connection error:', error);
    }
  };

  const disconnectDevice = () => {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
      bluetoothDevice.gatt.disconnect();
      setBluetoothDevice(null);
      setConnectedDevice(null);
      toast.info('Device disconnected');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center">
                <Bluetooth className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold gradient-text">BTConnect</span>
            </div>

            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChatbot(!showChatbot)}
                data-testid="chatbot-toggle-btn"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                AI Assistant
              </Button>
              <Link to="/settings">
                <Button variant="outline" size="sm" data-testid="settings-btn">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={onLogout} data-testid="logout-btn">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome back, {user?.name || 'User'}!</h1>
          <p className="text-gray-600">Manage your Bluetooth devices and monitor real-time data</p>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Bluetooth Scanner */}
          <div className="lg:col-span-2 space-y-6">
            <Card data-testid="bluetooth-scanner-card">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Radio className="w-5 h-5 mr-2 text-blue-600" />
                  Bluetooth Scanner
                </CardTitle>
                <CardDescription>
                  Scan for nearby Bluetooth devices and connect
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button
                    onClick={scanForDevices}
                    disabled={scanning}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white"
                    data-testid="scan-devices-btn"
                  >
                    {scanning ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Bluetooth className="w-4 h-4 mr-2" />
                        Scan for Devices
                      </>
                    )}
                  </Button>

                  {connectedDevice && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <Wifi className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900" data-testid="connected-device-name">{connectedDevice.name}</p>
                            <p className="text-sm text-gray-600">Connected</p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={disconnectDevice}
                          data-testid="disconnect-btn"
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Sensor Data */}
            <Card data-testid="sensor-data-card">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-cyan-600" />
                  Real-time Sensor Data
                </CardTitle>
                <CardDescription>
                  Live data from connected devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sensorData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No sensor data available</p>
                    <p className="text-sm">Connect a device to see live data</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {sensorData.map((data, index) => (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg" data-testid={`sensor-data-item-${index}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-gray-900 capitalize">{data.type}</p>
                            {data.battery_level !== undefined && (
                              <p className="text-sm text-gray-600">Battery: {data.battery_level}%</p>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {new Date(data.timestamp).toLocaleTimeString()}
                          </p>
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
            <Card data-testid="saved-devices-card">
              <CardHeader>
                <CardTitle>Saved Devices</CardTitle>
                <CardDescription>
                  Previously connected devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {devices.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <WifiOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No devices saved yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {devices.map((device) => (
                      <div
                        key={device.id}
                        className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        data-testid={`saved-device-${device.device_id}`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Bluetooth className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{device.device_name}</p>
                            <p className="text-xs text-gray-500">
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