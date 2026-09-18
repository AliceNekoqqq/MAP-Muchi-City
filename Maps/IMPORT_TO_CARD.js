await import('https://cdn.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@v2.0.0/Maps/index.js?muchi=200')
  .catch(()=>import('https://testingcf.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Maps/index.js?muchi=200'))
  .catch(()=>import('https://fastly.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Maps/index.js?muchi=200'));
