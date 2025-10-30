from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer(auto_error=False)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== Models ====================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Session(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BluetoothDevice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    device_id: str
    device_name: str
    connected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SensorData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    device_id: str
    data: dict
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    message: str
    response: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Problem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_email: str
    problem_description: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserUpdate(BaseModel):
    name: Optional[str] = None
    picture: Optional[str] = None
    email_notifications: Optional[bool] = None

# ==================== Helper Functions ====================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

async def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    """Get current user from session token"""
    # First try to get token from cookie
    session_token = request.cookies.get('session_token')
    
    # Fallback to Authorization header
    if not session_token and credentials:
        session_token = credentials.credentials
    
    if not session_token:
        return None
    
    # Find session
    session = await db.sessions.find_one({"session_token": session_token})
    if not session or datetime.fromisoformat(session['expires_at']) < datetime.now(timezone.utc):
        return None
    
    # Get user
    user = await db.users.find_one({"id": session['user_id']}, {"_id": 0})
    return user

def send_email(subject: str, body: str) -> bool:
    """Send email via Gmail SMTP"""
    try:
        gmail_address = os.environ.get('GMAIL_ADDRESS')
        gmail_password = os.environ.get('GMAIL_APP_PASSWORD')
        recipient = os.environ.get('RECIPIENT_EMAIL')
        smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        
        if not gmail_address or not gmail_password:
            logger.error("Gmail credentials not configured")
            return False
        
        msg = MIMEMultipart("alternative")
        msg["From"] = gmail_address
        msg["To"] = recipient
        msg["Subject"] = subject
        
        msg.attach(MIMEText(body, "plain"))
        
        logger.info(f"Attempting to send email to {recipient} via {smtp_server}:{smtp_port}")
        
        with smtplib.SMTP(smtp_server, smtp_port, timeout=30) as server:
            server.set_debuglevel(1)  # Enable debug output
            server.starttls()
            server.login(gmail_address, gmail_password)
            server.sendmail(gmail_address, [recipient], msg.as_string())
        
        logger.info(f"Email sent successfully to {recipient}")
        return True
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP Authentication failed: {str(e)}")
        return False
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return False

# ==================== Auth Routes ====================

@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name
    )
    
    user_doc = user.model_dump()
    user_doc['password'] = hash_password(user_data.password)
    user_doc['created_at'] = user_doc['created_at'].isoformat()
    
    await db.users.insert_one(user_doc)
    
    # Create session
    session_token = str(uuid.uuid4())
    session = Session(
        user_id=user.id,
        session_token=session_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7)
    )
    
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    
    await db.sessions.insert_one(session_doc)
    
    response = Response(content='{"success": true, "user": {"id": "' + user.id + '", "email": "' + user.email + '", "name": "' + str(user.name) + '"}}', media_type="application/json")
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7*24*60*60,
        path="/"
    )
    return response

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user.get('password', '')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create session
    session_token = str(uuid.uuid4())
    session = Session(
        user_id=user['id'],
        session_token=session_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7)
    )
    
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    
    await db.sessions.insert_one(session_doc)
    
    response = Response(content='{"success": true, "user": {"id": "' + user['id'] + '", "email": "' + user['email'] + '", "name": "' + str(user.get('name', '')) + '"}}', media_type="application/json")
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7*24*60*60,
        path="/"
    )
    return response

@api_router.get("/auth/session")
async def check_session(request: Request):
    """Check if user has valid session"""
    session_token = request.cookies.get('session_token')
    
    if not session_token:
        # Check for session_id in header (from Google OAuth)
        session_id = request.headers.get('X-Session-ID')
        if session_id:
            # Fetch session data from Emergent Auth
            try:
                response = requests.get(
                    'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data',
                    headers={'X-Session-ID': session_id}
                )
                if response.status_code == 200:
                    data = response.json()
                    # Check if user exists
                    user = await db.users.find_one({"email": data['email']}, {"_id": 0})
                    if not user:
                        # Create user
                        user_obj = User(
                            email=data['email'],
                            name=data.get('name'),
                            picture=data.get('picture')
                        )
                        user_doc = user_obj.model_dump()
                        user_doc['created_at'] = user_doc['created_at'].isoformat()
                        await db.users.insert_one(user_doc)
                        user = user_doc
                    
                    # Create session
                    session_token_new = data['session_token']
                    session = Session(
                        user_id=user['id'],
                        session_token=session_token_new,
                        expires_at=datetime.now(timezone.utc) + timedelta(days=7)
                    )
                    
                    session_doc = session.model_dump()
                    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
                    session_doc['created_at'] = session_doc['created_at'].isoformat()
                    
                    await db.sessions.insert_one(session_doc)
                    
                    resp = Response(content='{"authenticated": true, "user": {"id": "' + user['id'] + '", "email": "' + user['email'] + '", "name": "' + str(user.get('name', '')) + '", "picture": "' + str(user.get('picture', '')) + '"}}', media_type="application/json")
                    resp.set_cookie(
                        key="session_token",
                        value=session_token_new,
                        httponly=True,
                        secure=True,
                        samesite="none",
                        max_age=7*24*60*60,
                        path="/"
                    )
                    return resp
            except Exception as e:
                logger.error(f"Error processing Google OAuth: {str(e)}")
        
        return {"authenticated": False}
    
    # Validate existing session
    session = await db.sessions.find_one({"session_token": session_token})
    if not session or datetime.fromisoformat(session['expires_at']) < datetime.now(timezone.utc):
        return {"authenticated": False}
    
    user = await db.users.find_one({"id": session['user_id']}, {"_id": 0})
    if not user:
        return {"authenticated": False}
    
    return {
        "authenticated": True,
        "user": {
            "id": user['id'],
            "email": user['email'],
            "name": user.get('name'),
            "picture": user.get('picture')
        }
    }

@api_router.post("/auth/logout")
async def logout(request: Request):
    session_token = request.cookies.get('session_token')
    if session_token:
        await db.sessions.delete_one({"session_token": session_token})
    
    response = Response(content='{"success": true}')
    response.delete_cookie(key="session_token", path="/")
    return response

@api_router.put("/auth/profile")
async def update_profile(profile_data: UserUpdate, user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    update_fields = {}
    if profile_data.name is not None:
        update_fields['name'] = profile_data.name
    if profile_data.picture is not None:
        update_fields['picture'] = profile_data.picture
    if profile_data.email_notifications is not None:
        update_fields['email_notifications'] = profile_data.email_notifications
    
    if update_fields:
        await db.users.update_one(
            {"id": user['id']},
            {"$set": update_fields}
        )
    
    updated_user = await db.users.find_one({"id": user['id']}, {"_id": 0, "password": 0})
    return {"success": True, "user": updated_user}

# ==================== Bluetooth Device Routes ====================

@api_router.post("/devices")
async def save_device(device_data: dict, user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    device = BluetoothDevice(
        user_id=user['id'],
        device_id=device_data['device_id'],
        device_name=device_data['device_name']
    )
    
    device_doc = device.model_dump()
    device_doc['connected_at'] = device_doc['connected_at'].isoformat()
    
    # Check if device already exists
    existing = await db.devices.find_one({"user_id": user['id'], "device_id": device_data['device_id']})
    if existing:
        await db.devices.update_one(
            {"user_id": user['id'], "device_id": device_data['device_id']},
            {"$set": {"device_name": device_data['device_name'], "connected_at": device_doc['connected_at']}}
        )
    else:
        await db.devices.insert_one(device_doc)
    
    return {"success": True, "device": device_doc}

@api_router.get("/devices")
async def get_devices(user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    devices = await db.devices.find({"user_id": user['id']}, {"_id": 0}).to_list(1000)
    return {"devices": devices}

@api_router.post("/sensor-data")
async def save_sensor_data(sensor_data: dict, user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    data = SensorData(
        user_id=user['id'],
        device_id=sensor_data['device_id'],
        data=sensor_data['data']
    )
    
    data_doc = data.model_dump()
    data_doc['timestamp'] = data_doc['timestamp'].isoformat()
    
    await db.sensor_data.insert_one(data_doc)
    return {"success": True}

@api_router.get("/sensor-data/{device_id}")
async def get_sensor_data(device_id: str, user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    data = await db.sensor_data.find(
        {"user_id": user['id'], "device_id": device_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(100).to_list(100)
    
    return {"data": data}

# ==================== Chatbot Routes ====================

@api_router.post("/chat")
async def chat(message_data: dict, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        # Initialize LLM chat
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"user_{user['id']}",
            system_message="You are a helpful assistant for a Bluetooth device connection platform. Help users with their questions about connecting devices, troubleshooting issues, and using the platform features."
        ).with_model("openai", "gpt-5")
        
        # Send message
        user_message = UserMessage(text=message_data['message'])
        response = await chat.send_message(user_message)
        
        # Save to database
        chat_msg = ChatMessage(
            user_id=user['id'],
            message=message_data['message'],
            response=response
        )
        
        chat_doc = chat_msg.model_dump()
        chat_doc['timestamp'] = chat_doc['timestamp'].isoformat()
        
        await db.chat_history.insert_one(chat_doc)
        
        return {"response": response}
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process chat message")

@api_router.get("/chat/history")
async def get_chat_history(user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    history = await db.chat_history.find(
        {"user_id": user['id']},
        {"_id": 0}
    ).sort("timestamp", -1).limit(50).to_list(50)
    
    return {"history": history}

@api_router.post("/send-problem")
async def send_problem(problem_data: dict, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Save problem to database
    problem = Problem(
        user_id=user['id'],
        user_email=user['email'],
        problem_description=problem_data['problem']
    )
    
    problem_doc = problem.model_dump()
    problem_doc['timestamp'] = problem_doc['timestamp'].isoformat()
    
    await db.problems.insert_one(problem_doc)
    
    # Send email in background
    subject = f"User Problem Report from {user['email']}"
    body = f"""User: {user['email']}
User ID: {user['id']}
Timestamp: {problem.timestamp}

Problem Description:
{problem_data['problem']}
"""
    
    background_tasks.add_task(send_email, subject, body)
    
    return {"success": True, "message": "Problem reported successfully"}

@api_router.get("/")
async def root():
    return {"message": "Bluetooth Connector API"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Neuroglove backend is live!"}

