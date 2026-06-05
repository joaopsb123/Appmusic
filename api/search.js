export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q, max = 20 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Parâmetro "q" é obrigatório' });
  }

  try {
    // Buscar na página de resultados do YouTube
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube respondeu com status ${response.status}`);
    }

    const html = await response.text();
    
    // Extrair dados do JSON inicial do YouTube
    const jsonMatch = html.match(/var ytInitialData = ({.*?});<\/script>/);
    
    if (!jsonMatch) {
      throw new Error('Não foi possível extrair dados do YouTube');
    }

    const data = JSON.parse(jsonMatch[1]);
    
    // Extrair vídeos dos resultados
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    
    if (!contents) {
      throw new Error('Formato de resposta não reconhecido');
    }

    const videos = [];
    
    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!items) continue;
      
      for (const item of items) {
        const videoRenderer = item?.videoRenderer;
        if (!videoRenderer) continue;
        
        const videoId = videoRenderer.videoId;
        const title = videoRenderer.title?.runs?.[0]?.text || 'Sem título';
        const channelName = videoRenderer.ownerText?.runs?.[0]?.text || 'Canal desconhecido';
        const channelId = videoRenderer.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
        const viewsText = videoRenderer.viewCountText?.simpleText || videoRenderer.viewCountText?.runs?.[0]?.text || '0 visualização';
        const lengthText = videoRenderer.lengthText?.simpleText || '';
        const publishedTime = videoRenderer.publishedTimeText?.simpleText || '';
        const description = videoRenderer.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map(r => r.text).join('') || '';
        
        // Thumbnails
        const thumbnails = videoRenderer.thumbnail?.thumbnails || [];
        const thumbnail = thumbnails[thumbnails.length - 1]?.url || '';
        
        // Badges (verificado, etc)
        const badges = videoRenderer.ownerBadges?.map(badge => 
          badge?.metadataBadgeRenderer?.style
        ).filter(Boolean) || [];
        
        videos.push({
          id: videoId,
          title,
          channel: {
            name: channelName,
            id: channelId
          },
          views: viewsText,
          duration: lengthText,
          publishedTime,
          description: description.substring(0, 200),
          thumbnail,
          badges,
          url: `https://www.youtube.com/watch?v=${videoId}`
        });
        
        if (videos.length >= parseInt(max)) break;
      }
      
      if (videos.length >= parseInt(max)) break;
    }

    // Cache por 5 minutos
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    res.status(200).json({
      success: true,
      query: q,
      total: videos.length,
      videos
    });

  } catch (error) {
    console.error('Erro na busca:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao buscar vídeos',
      message: error.message 
    });
  }
}
