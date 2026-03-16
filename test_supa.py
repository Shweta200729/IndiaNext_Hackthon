import urllib.request, json, urllib.error

url = 'https://phdxfjjvsktozvrjbmkj.supabase.co/auth/v1/signup'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZHhmamp2c2t0b3p2cmpibWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTEzMDksImV4cCI6MjA4NzIyNzMwOX0.ezhHBGAkVx1vkY_diYnC6PdT9oYTOW6-0leEylQwZZg',
    'Content-Type': 'application/json'
}
data = json.dumps({'email': 'testdbuser999@example.com', 'password': 'Password123!'}).encode('utf-8')

req = urllib.request.Request(url, headers=headers, data=data)

try:
    res = urllib.request.urlopen(req)
    print(res.read().decode())
except urllib.error.HTTPError as e:
    print('HTTPError:', e.code)
    print(e.read().decode())
