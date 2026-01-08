from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from typing import List
from database import create_db_and_tables, get_session, Session
from auth import oauth, create_access_token, get_current_user
import crud, auth
from models import User
from dotenv import load_dotenv
import os

load_dotenv() # Load .env file

app = FastAPI(title="SecureChatAG", description="E2EE Messaging App Backend")

# Required for Authlib state storage
# Better to use a stable secret from env, fallback to random if missing (for dev)
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY", "some-random-string"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

@app.get("/")
async def root():
    return {"message": "SecureChatAG Backend Running"}

@app.get("/auth/login")
async def login(request: Request):
    # Redirect url: https://chat.frostlynn.my.id/auth/callback (Production)
    # Or http://localhost:8000/auth/callback (Local)
    domain = os.getenv('DOMAIN')
    if domain:
        # Strip trailing slash if present
        domain = domain.rstrip('/')
        redirect_uri = f"{domain}/auth/callback"
    else:
        # Fallback for localhost
        redirect_uri = request.url_for('auth_callback')
        
    print(f"DEBUG: Generated Redirect URI: {redirect_uri}")
    print(f"DEBUG: Client ID Loaded: {os.getenv('GOOGLE_CLIENT_ID', 'Not Found')[:10]}...")
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/auth/callback")
async def auth_callback(request: Request, session: Session = Depends(get_session)):
    try:
        token = await oauth.google.authorize_access_token(request)
        print(f"DEBUG: Token received: {token.keys()}")
    except Exception as e:
        print(f"DEBUG: OAuth Access Token Error: {e}")
        raise HTTPException(status_code=400, detail=f"OAuth Error: {str(e)}")
        
    user_info = token.get('userinfo')
    if not user_info:
        print("DEBUG: 'userinfo' not in token, checking id_token...")
        user_info = token.get('id_token') 
        # If id_token is a string (JWT), Authlib might have already parsed it if configured?
        # If it's just the raw string, we might need to rely on the 'userinfo' endpoint or decoding.
        # But 'openid' scope usually inserts 'userinfo' into the dict if using Starlette client.
    
    print(f"DEBUG: User Info: {user_info}")
    
    if not user_info:
        raise HTTPException(status_code=400, detail="Could not get user info")

    try:
        # Check/Create User
        email = user_info.get('email')
        name = user_info.get('name') or user_info.get('given_name')
        picture = user_info.get('picture')
        
        if not email:
             raise Exception("Email missing from User Info")

        print(f"DEBUG: Processing User {email}")
        
        user = crud.get_user_by_email(session, email)
        if not user:
            print("DEBUG: Creating new user")
            user = User(email=email, username=name, picture=picture)
            user = crud.create_user(session, user)
        else:
            print(f"DEBUG: Found existing user {user.id}")
            
    except Exception as e:
        print(f"DEBUG: DB/User Error: {e}")
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")
        
    # Create JWT
    access_token = create_access_token(data={"sub": user.username, "id": user.id})
    
    # Redirect to Frontend with Token
    # Use FRONTEND_URL env var if available, otherwise default to localhost:5173
    frontend_base = os.getenv('FRONTEND_URL', 'http://localhost:5173')
    from urllib.parse import urlencode
    
    # Construct query params safely
    params = {
        "token": access_token,
        "user": user.username,
        "uid": str(user.id)
    }
    query_string = urlencode(params)
    frontend_url = f"{frontend_base}/login?{query_string}"
    
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=frontend_url)

from pydantic import BaseModel
import json

# ... (Previous imports kept in other chunks if needed, but here we replace mostly the bottom half)

class ContactRequest(BaseModel):
    username: str

class GroupRequest(BaseModel):
    name: str
    members: List[str]

@app.post("/contacts/add")
def add_contact(req: ContactRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    # Use the authenticated user
    pass
    # Stub continued

@app.get("/users/search")
def search_user(username: str, session: Session = Depends(get_session)):
    user = crud.get_user_by_username(session, username)
    return {"found": bool(user), "username": user.username if user else None}

@app.post("/users/{user_id}/contacts")
def add_user_contact(user_id: int, req: ContactRequest, session: Session = Depends(get_session)):
    # Ideally check if user_id matches current_user
    contact = crud.add_contact(session, user_id, req.username)
    if not contact:
        raise HTTPException(status_code=404, detail="User not found or already added")
    return {"status": "added", "contact": contact}

@app.get("/users/{user_id}/contacts")
def list_contacts(user_id: int, session: Session = Depends(get_session)):
    return crud.get_contacts(session, user_id)

@app.post("/users/{user_id}/groups")
def create_group(user_id: int, req: GroupRequest, session: Session = Depends(get_session)):
    group = crud.create_group(session, user_id, req.name, req.members)
    return group

@app.get("/users/{user_id}/groups")
def list_groups(user_id: int, session: Session = Depends(get_session)):
    return crud.get_user_groups(session, user_id)

class UsernameUpdate(BaseModel):
    username: str

@app.put("/users/{user_id}/username")
def update_username(user_id: int, req: UsernameUpdate, session: Session = Depends(get_session)):
    # In real app: check current_user.id == user_id
    updated = crud.update_user_username(session, user_id, req.username)
    return updated

@app.get("/users/{user_id}/chats")
def list_chats(user_id: int, session: Session = Depends(get_session)):
    """Returns combined list of contacts and active chat partners"""
    active_users = crud.get_active_chat_users(session, user_id)
    groups = crud.get_user_groups(session, user_id)
    return {
        "users": active_users,
        "groups": groups
    }

class ConnectionManager:
    def __init__(self):
        # Map user_id -> WebSocket
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: str, recipient_id: int):
        if recipient_id in self.active_connections:
            await self.active_connections[recipient_id].send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections.values():
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int, session: Session = Depends(get_session)):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Expecting JSON: {target: 'user'|'group', target_id: int, content: ...}
            try:
                msg_obj = json.loads(data)
                
                # Check if it's file or text (handled by frontend content blobbing)
                # Just routing here.
                
                # Check if it's file or text (handled by frontend content blobbing)
                # Just routing here.
                            
            except json.JSONDecodeError:
                # Fallback for legacy simple chat
                pass
            
            else:
                 # SAVE TO DB
                # Data structure from frontend: { target, target_id, sender_id, sender_username, type, data (the content_blob), ...? }
                # Frontend encrypts data.
                # content_blob is 'data'.
                # But where is 'nonce'? The 'data' field in ChaCha/AES logic in JS returned { cipher, nonce }?
                # JS crypto.js: encryptChaCha returns { cipher, nonce }.
                # JS Chat.jsx: payload = { ..., data: encData } where encData is `input` text?? 
                # Wait, check Chat.jsx sendMessage:
                # encData = await cryptoLib.encryptChaCha(input, secretKey) -> Returns OBJECT {cipher, nonce}
                # So `data` in payload is {cipher: "...", nonce: "..."} ?
                # The payload in `Chat.jsx` is:
                # type: 'text', data: encData
                # So `data` IS the object.
                
                # So content_blob = msg_obj['data']['cipher']
                # nonce = msg_obj['data']['nonce']
                # algorithm = 'ChaCha20' (for text)
                
                # For file:
                # type: 'file', encryptedContent, iv, ...
                # logic varies.
                
                try:
                    target_type = msg_obj.get('target')
                    t_id = int(msg_obj.get('target_id'))
                    is_file = msg_obj.get('type') == 'file'
                    
                    blob = ""
                    nonce_val = ""
                    algo = "ChaCha20"
                    
                    if is_file:
                        blob = msg_obj.get('encryptedContent') # Base64
                        nonce_val = str(msg_obj.get('iv')) 
                        algo = "AES"
                    else:
                        cipher_data = msg_obj.get('data') 
                        if isinstance(cipher_data, dict):
                            blob = cipher_data.get('cipher')
                            nonce_val = cipher_data.get('nonce')
                        
                    if blob:
                         crud.create_message(
                            session, 
                            sender_id=client_id, 
                            target_type=target_type, 
                            target_id=t_id, 
                            content_blob=blob, 
                            nonce=nonce_val, 
                            algorithm=algo, 
                            is_file=is_file
                        )
                except Exception as e:
                    print(f"Error saving message: {e}")

                if msg_obj.get('target') == 'user':
                    recipient_id = int(msg_obj['target_id'])
                    await manager.send_personal_message(data, recipient_id)
                
                elif msg_obj.get('target') == 'group':
                    group_id = int(msg_obj['target_id'])
                    members = crud.get_group_members(session, group_id)
                    for member_id in members:
                        if member_id != client_id:
                            await manager.send_personal_message(data, member_id)
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        # await manager.broadcast(f"Client #{client_id} left the chat")
