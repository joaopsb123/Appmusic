export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Parâmetro "id" é obrigatório' });
  }

  try {
    // Buscar informações do vídeo para obter streams
    const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await response.text();
    
    // Extrair dados do player
    const playerMatch = html.match(/var ytInitialPlayerResponse = ({.*?});<\/script>/);
    
    if (!playerMatch) {
      throw new Error('Não foi possível extrair dados do player');
    }

    const playerData = JSON.parse(playerMatch[1]);
    const streamingData = playerData?.streamingData;
    
    if (!streamingData) {
      throw new Error('Dados de streaming não disponíveis');
    }

    // Buscar formatos de áudio
    const formats = [
      ...(streamingData.adaptiveFormats || []),
      ...(streamingData.formats || [])
    ];

    // Filtrar apenas áudio
    const audioFormats = formats.filter(f => 
      f.mimeType && f.mimeType.includes('audio')
    );

    if (audioFormats.length === 0) {
      throw new Error('Nenhum formato de áudio encontrado');
    }

    // Pegar o melhor formato de áudio
    const bestAudio = audioFormats.sort((a, b) => {
      const bitrateA = a.bitrate || 0;
      const bitrateB = b.bitrate || 0;
      return bitrateB - bitrateA;
    })[0];

    // Fazer proxy do stream de áudio
    const audioResponse = await fetch(bestAudio.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Range': req.headers.range || 'bytes=0-'
      }
    });

    // Configurar headers para streaming
    const headers = {
      'Content-Type': bestAudio.mimeType || 'audio/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600'
    };

    if (audioResponse.headers.get('content-length')) {
      headers['Content-Length'] = audioResponse.headers.get('content-length');
    }

    if (audioResponse.headers.get('content-range')) {
      headers['Content-Range'] = audioResponse.headers.get('content-range');
    }

    res.writeHead(audioResponse.status, headers);
    
    // Fazer pipe do stream
    const reader = audioResponse.body.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    
    res.end();

  } catch (error) {
    console.error('Erro no streaming:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao fazer streaming',
      message: error.message 
    });
  }
}
