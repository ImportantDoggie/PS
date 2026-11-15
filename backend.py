import http.server
import socketserver
import json
import os
import subprocess
import threading
import time
import winreg
from urllib.parse import urlparse

PORT = 47823
STATE_FILE = "library.json"
sessions = {}
tracking = True

# --- Сканер игр ---
def find_steam_games():
    games = []
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam")
        steam_path, _ = winreg.QueryValueEx(key, "SteamPath")
        lib_file = os.path.join(steam_path, "steamapps", "libraryfolders.vdf")
        if os.path.exists(lib_file):
            with open(lib_file, 'r', encoding='utf-8') as f:
                content = f.read()
                import re
                paths = re.findall(r'"path"\s+"([^"]+)"', content)
                for p in paths:
                    p = p.replace('\\\\', '\\')
                    apps = os.path.join(p, "steamapps")
                    if os.path.exists(apps):
                        for f in os.listdir(apps):
                            if f.startswith("appmanifest_") and f.endswith(".acf"):
                                with open(os.path.join(apps, f), 'r', encoding='utf-8') as acf:
                                    acf_content = acf.read()
                                    appid = re.search(r'"appid"\s+"(\d+)"', acf_content)
                                    name = re.search(r'"name"\s+"([^"]+)"', acf_content)
                                    if appid and name:
                                        games.append({
                                            "id": f"steam-{appid.group(1)}",
                                            "name": name.group(1),
                                            "source": "steam",
                                            "appId": int(appid.group(1)),
                                            "installed": True,
                                            "playtimeSeconds": 0,
                                            "launchUri": f"steam://rungameid/{appid.group(1)}",
                                            "cover": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid.group(1)}/library_600x900_2x.jpg",
                                            "hero": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid.group(1)}/library_hero.jpg",
                                            "logo": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid.group(1)}/logo.png",
                                            "favorite": False, "hidden": False, "order": len(games)
                                        })
    except: pass
    return games

def find_shortcuts():
    games = []
    desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')
    for f in os.listdir(desktop):
        if f.endswith('.lnk'):
            games.append({
                "id": f"lnk-{f}",
                "name": f.replace('.lnk', ''),
                "source": "shortcut",
                "installDir": desktop,
                "exePath": os.path.join(desktop, f),
                "installed": True,
                "playtimeSeconds": 0,
                "cover": "", "hero": "", "logo": "",
                "favorite": False, "hidden": False, "order": len(games)
            })
    return games

def scan_all():
    global state
    all_games = find_steam_games() + find_shortcuts()
    existing_ids = {g['id'] for g in state['games']}
    added = 0
    for g in all_games:
        if g['id'] not in existing_ids:
            state['games'].append(g)
            added += 1
    save_state()
    return added

def save_state():
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def load_state():
    global state
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            state = json.load(f)
    else:
        state = {"games": [], "settings": {"scanSources": {"steam": True, "shortcuts": True}}}

# --- Трекер ---
def check_processes():
    while True:
        if tracking:
            for gid, s in list(sessions.items()):
                try:
                    if s.get('demo'):
                        s['elapsed'] = int(time.time() - s['start'])
                    elif s.get('pid'):
                        # Проверяем, живой ли процесс
                        output = subprocess.check_output(f'tasklist /FI "PID eq {s["pid"]}"', shell=True).decode('cp866')
                        if str(s["pid"]) not in output:
                            end_session(gid)
                    elif s.get('exe'):
                        # Проверяем по имени exe
                        exe_name = os.path.basename(s['exe'])
                        output = subprocess.check_output(f'tasklist /FI "IMAGENAME eq {exe_name}"', shell=True).decode('cp866')
                        if exe_name not in output:
                            end_session(gid)
                except: pass
        time.sleep(5)

def end_session(gid):
    if gid in sessions:
        s = sessions[gid]
        elapsed = int(time.time() - s['start'])
        for g in state['games']:
            if g['id'] == gid:
                g['playtimeSeconds'] = g.get('playtimeSeconds', 0) + elapsed
                g['lastPlayed'] = int(time.time() * 1000)
                break
        del sessions[gid]
        save_state()

def start_session(gid):
    g = next((x for x in state['games'] if x['id'] == gid), None)
    if not g: return {"ok": False, "error": "Не найдена"}
    
    pid = None
    exe = g.get('exePath')
    if g.get('launchUri'):
        os.startfile(g['launchUri'])
    elif exe and os.path.exists(exe):
        if exe.endswith('.lnk'):
            os.startfile(exe)
        else:
            proc = subprocess.Popen([exe], cwd=g.get('installDir', ''), shell=True)
            pid = proc.pid
    else:
        return {"ok": False, "error": "Нет пути"}
    
    sessions[gid] = {"start": time.time(), "pid": pid, "exe": exe}
    return {"ok": True}

# --- HTTP Сервер ---
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/state':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            res = {
                "mode": "desktop",
                "games": state['games'],
                "settings": state['settings'],
                "views": [], "notifications": [],
                "sessions": [{"gameId": k, "elapsed": int(time.time() - v['start'])} for k, v in sessions.items()],
                "scan": {}
            }
            self.wfile.write(json.dumps(res).encode('utf-8'))
        else:
            if parsed.path == '/': self.path = '/public/index.html'
            else: self.path = '/public' + parsed.path
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8') if length else '{}'
        try: data = json.loads(body)
        except: data = {}

        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        res = {"ok": True}

        if parsed.path == '/api/scan':
            added = scan_all()
            res["added"] = added
        elif parsed.path.endswith('/launch'):
            gid = parsed.path.split('/')[3]
            res = start_session(gid)
        elif parsed.path.endswith('/stop'):
            gid = parsed.path.split('/')[3]
            end_session(gid)
        elif parsed.path.endswith('/favorite'):
            gid = parsed.path.split('/')[3]
            for g in state['games']:
                if g['id'] == gid: g['favorite'] = not g.get('favorite', False)
            save_state()
        
        self.wfile.write(json.dumps(res).encode('utf-8'))

if __name__ == '__main__':
    load_state()
    threading.Thread(target=check_processes, daemon=True).start()
    os.chdir(os.path.dirname(os.path.abspath(__file__))) # Чтобы пути работали
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Лаунчер запущен! Открой в браузере: http://localhost:{PORT}")
        httpd.serve_forever()