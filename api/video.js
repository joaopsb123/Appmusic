export default async function handler(req, res) {
  // Configurar CORS
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
    // Buscar página do vídeo
    const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube respondeu com status ${response.status}`);
    }

    const html = await response.text();
    
    // Extrair dados do JSON inicial
    const jsonMatch = html.match(/var ytInitialData = ({.*?});<\/script>/);
    
    if (!jsonMatch) {
      throw new Error('Não foi possível extrair dados do vídeo');
    }

    const data = JSON.parse(jsonMatch[1]);
    
    // Extrair informações do vídeo
    const videoData = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    const playerResponse = data?.playerResponse || {};
    const videoDetails = playerResponse?.videoDetails || {};
    const microformat = playerResponse?.microformat?.playerMicroformatRenderer || {};
    
    // Estatísticas
    let views = 0;
    let likes = 0;
    
    for (const content of (videoData || [])) {
      const item = content?.videoPrimaryInfoRenderer || content?.itemSectionRenderer?.contents?.[0]?.videoPrimaryInfoRenderer;
      if (item) {
        views = parseInt(item.viewCount?.videoViewCountRenderer?.viewCount?.simpleText?.replace(/[^0-9]/g, '') || '0');
      }
      
      const sentinel = content?.videoSecondaryInfoRenderer || content?.itemSectionRenderer?.contents?.[0]?.videoSecondaryInfoRenderer;
      if (sentinel) {
        const likeButton = sentinel?.likeButton?.toggleButtonRenderer?.defaultText?.simpleText || '0';
        likes = parseInt(likeButton.replace(/[^0-9]/g, '') || '0');
      }
    }

    const result = {
      id: videoDetails.videoId || id,
      title: videoDetails.title || 'Título não disponível',
      description: videoDetails.shortDescription || '',
      duration: parseInt(videoDetails.lengthSeconds || '0'),
      keywords: videoDetails.keywords || [],
      channel: {
        id: videoDetails.channelId || '',
        name: videoDetails.author || 'Canal desconhecido',
        thumbnail: videoDetails.authorThumbnails?.[0]?.url || ''
      },
      views,
      likes,
      category: microformat.category || '',
      publishedAt: microformat.publishDate || '',
      thumbnail: videoDetails.thumbnail?.thumbnails?.pop()?.url || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      thumbnails: videoDetails.thumbnail?.thumbnails || [],
      isLive: videoDetails.isLiveContent || false,
      url: `https://www.youtube.com/watch?v=${id}`
    };

    // Cache por 5 minutos
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.status(200).json({
      success: true,
      video: result
    });

  } catch (error) {
    console.error('Erro ao obter detalhes:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao obter detalhes do vídeo',
      message: error.message 
    });
  }
}
