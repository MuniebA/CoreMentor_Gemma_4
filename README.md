# CoreMentor_Gemma_4
CoreMentor is a locally-hosted, agentic educational ecosystem powered by Gemma 4, designed to bridge the gap between classroom learning and professional aspirations. By utilizing a multi-agent mesh, the system automates homework grading through Vision/OCR, identifies learning patterns, and translates curriculum into career-themed exercises.


Python (For FastAPI & AI Agents):
Download from python.org.

Node.js (For Next.js Frontend):
Download the LTS version (Long Term Support) from nodejs.org. This includes npm

Download Postgres, Interactive Installer (Windows) from postgresql.org.


VS Code Extensions (Highly Recommended)
To make his life easier, he should install these extensions from the VS Code Marketplace:

Python (by Microsoft)

ESLint (for catching JavaScript errors)

Tailwind CSS IntelliSense (for the UI)

Thunder Client or Postman (to test the API without a browser)




for the .env file
pip install python-dotenv



cd backend
python -m venv venv

.\venv\Scripts\activate
pip install fastapi uvicorn

deactivate
cd ..
npx create-next-app@latest frontend


DB:
step 1: Install PostgreSQL
Go to postgresql.org/download/windows and click the Interactive Installer by EnterpriseDB.

during insatalation:
Expand this category and select psqlODBC or any 64-bit drivers. These are essential because FastAPI needs them to connect your Python backend to the PostgreSQL database.


Step 2: Create the Project Database (Using pgAdmin 4)
pgAdmin 4 is the visual tool that comes with Postgres. It’s the easiest way for a beginner to manage data.  

Open pgAdmin 4 from the Start menu/Applications.

It will ask for a "Master Password" (set a simple one for the app).

In the left sidebar, right-click on Servers > Register > Server.

Name it LocalHost.

In the Connection tab, set Host to localhost and use the password he set during installation.

Once connected, right-click Databases > Create > Database...

Database Name: core_mentor_db

Click Save.


cd backend
.\venv\Scripts\activate
pip install sqlalchemy psycopg2


JWT Authentication:
(make sure your venv is active):

cd backend
# Install the missing security libraries
pip install "python-jose[cryptography]" passlib[bcrypt] python-multipart


install pillow and dotenv:
pip install Pillow python-dotenv


run the seeder:
run under the backend with venv active
python seeder.py 

to run the server:
under the backend with the venv active
uvicorn main:app --reload




pip install "python-jose[cryptography]" passlib[bcrypt] python-multipart Pillow python-dotenv


errors fix:
Pin the Bcrypt Version
You need to downgrade bcrypt to version 4.3.0, which is the last version that works perfectly with passlib.

Run these commands in your terminal (with your venv active):

Uninstall the current broken version:

Bash
pip uninstall bcrypt
Install the compatible version:

Bash
pip install bcrypt==4.3.0