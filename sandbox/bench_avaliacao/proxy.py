# Banco de testes da avaliação: atende o código real do portal (rodando no navegador local) com
# (1) RPCs SÓ DE LEITURA do banco de produção e (2) o motor de anúncios rodando aqui (sem login).
import http.server, json, os, sys, urllib.parse, decimal, datetime, psycopg2
sys.path.insert(0, '/Users/Rodrigo/Downloads/novasp-extraido/motor-precos'); os.environ['EXIGE_LOGIN'] = '0'
import precos_api
LEITURA = {'aval_comps_itbi_raio','aval_comps_itbi_raio2','aval_terreno_local','aval_quadra_ponto','aval_ruas_distancia','aval_comps_itbi','aval_geocode','aval_geocode_endereco','aval_geocode_ruas','aval_geo','aval_entorno',
           'aval_lanc_anuncio','aval_lanc_itbi','aval_outorga_ref','aval_fp','aval_fatos','aval_rua_geo'}
c = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip()); c.autocommit = True
cur = c.cursor(); cur.execute("set default_transaction_read_only = on")
def conv(o):
    if isinstance(o, decimal.Decimal): return float(o)
    if isinstance(o, (datetime.date, datetime.datetime)): return o.isoformat()
    return str(o)
import threading
LOCK = threading.Lock()
def rpc(fn, args):
  with LOCK:
    return _rpc(fn, args)
def _rpc(fn, args):
    cur.execute("select p.proretset, t.typname from pg_proc p join pg_type t on t.oid=p.prorettype where p.proname=%s limit 1", (fn,))
    retset, tipo = cur.fetchone()
    nomes = ', '.join(f'{k} => %({k})s' for k in args)
    cur.execute(f'select * from {fn}({nomes})', args)
    cols = [d[0] for d in cur.description]; rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    if retset or tipo == 'record' or len(cols) > 1: return rows
    return rows[0][cols[0]] if rows else None
class H(http.server.BaseHTTPRequestHandler):
    def _ok(self, obj, code=200):
        b = json.dumps(obj, default=conv).encode()
        self.send_response(code); self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self._ok({})
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/precos':
            b = urllib.parse.parse_qs(u.query).get('bairro', [''])[0]
            try: self._ok(precos_api.precos(b, None, None))
            except Exception as e: self._ok({'erro': str(e)}, 502)
        else: self._ok({'erro': 'rota'}, 404)
    def do_POST(self):
        fn = self.path.rstrip('/').split('/')[-1]
        if fn not in LEITURA: return self._ok({'message': 'fora da lista de leitura: ' + fn}, 403)
        args = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        try: self._ok(rpc(fn, args))
        except Exception as e:
            c.rollback() if not c.autocommit else None; self._ok({'message': str(e)[:300]}, 400)
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8792), H).serve_forever()
