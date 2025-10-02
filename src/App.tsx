import React, { useEffect, useState, DragEvent, ChangeEvent } from 'react';
import type { Game, GameSummary, GameCategories } from './types';
import { VennDiagram } from './components/VennDiagram';
import { Upload, ChevronDown, ChevronRight, Search } from 'lucide-react';
import JSZip from 'jszip';

// Extract environment from filename
const getEnvironmentFromFileName = (fileName: string): string => {
  const match = fileName.match(/^([^-]+)/);
  return match ? match[1].toUpperCase() : 'Unknown';
};

// Parse functions with improved error handling
const parseContentHubData = (data: any): Game[] => {
  if (!data?.gameList) {
    console.error('Content Hub data missing gameList:', data);
    return [];
  }
  if (!Array.isArray(data.gameList)) {
    console.error('Content Hub gameList is not an array:', data.gameList);
    return [];
  }
  return data.gameList.map(game => ({
    gameID: game.gameID,
    name: game.title,
    isActive: game.isActive
  }));
};

const parseUPAMData = (data: any): Game[] => {
  if (!data?.data) {
    console.error('UPAM data missing data field:', data);
    return [];
  }
  if (!Array.isArray(data.data)) {
    console.error('UPAM data is not an array:', data.data);
    return [];
  }
  return data.data.map(game => ({
    externalGameId: game.attributes.externalGameId,
    name: game.attributes.name,
    enabled: game.attributes.enabled
  }));
};

const parseCMSData = (data: any): Game[] => {
  if (!data?.results) {
    console.error('CMS data missing results:', data);
    return [];
  }
  if (!Array.isArray(data.results)) {
    console.error('CMS results is not an array:', data.results);
    return [];
  }
  return data.results.map(game => ({
    gameId: game.gameId,
    name: game.name,
    isHidden: game.isHidden ?? false
  }));
};

function App() {
  const [environment, setEnvironment] = useState<string>('Unknown');
  const [gameData, setGameData] = useState<{
    cms: Game[];
    contentHub: Game[];
    upam: Game[];
  }>({
    cms: [],
    contentHub: [],
    upam: []
  });

  const [summary, setSummary] = useState<GameSummary>({
    allThree: 0,
    cmsOnly: 0,
    contentHubOnly: 0,
    upamOnly: 0,
    cmsAndContentHub: 0,
    cmsAndUpam: 0,
    contentHubAndUpam: 0,
    total: 0
  });

  const [gameCategories, setGameCategories] = useState<GameCategories>({
    allThree: [],
    cmsOnly: [],
    contentHubOnly: [],
    upamOnly: [],
    cmsAndContentHub: [],
    cmsAndUpam: [],
    contentHubAndUpam: []
  });

  const [uploadedFiles, setUploadedFiles] = useState({
    cms: false,
    contentHub: false,
    upam: false
  });

  const [expandedCategories, setExpandedCategories] = useState<{[key: string]: boolean}>({});
  const [filterString, setFilterString] = useState<string>('');

  const processFile = async (file: File) => {
    try {
      console.log('Processing file:', file.name);
      const text = await file.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('Error parsing JSON from file:', file.name, parseError);
        return;
      }

      // Update environment from the first file
      const fileEnv = getEnvironmentFromFileName(file.name);
      if (fileEnv !== 'Unknown') {
        setEnvironment(fileEnv);
      }

      let parsedData: Game[] = [];

      if (file.name.toLowerCase().includes('cms')) {
        parsedData = parseCMSData(data);
        if (parsedData.length > 0) {
          setGameData(prev => ({ ...prev, cms: parsedData }));
          setUploadedFiles(prev => ({ ...prev, cms: true }));
        }
      } else if (file.name.toLowerCase().includes('iwg')) {
        parsedData = parseContentHubData(data);
        if (parsedData.length > 0) {
          setGameData(prev => ({ ...prev, contentHub: parsedData }));
          setUploadedFiles(prev => ({ ...prev, contentHub: true }));
        }
      } else if (file.name.toLowerCase().includes('upam')) {
        parsedData = parseUPAMData(data);
        if (parsedData.length > 0) {
          setGameData(prev => ({ ...prev, upam: parsedData }));
          setUploadedFiles(prev => ({ ...prev, upam: true }));
        }
      } else {
        console.warn('Unrecognized file type:', file.name);
      }

      console.log(`Processed ${parsedData.length} games from ${file.name}`);
    } catch (error) {
      console.error('Error reading file:', file.name, error);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          if (file.name.endsWith('.zip')) {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            for (const filename in contents.files) {
              const unzippedFile = await contents.files[filename].async('blob');
              await processFile(new File([unzippedFile], filename));
            }
          } else {
            await processFile(file);
          }
        }
      }
    }
  };

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      for (const file of files) {
        if (file.name.endsWith('.zip')) {
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);
          for (const filename in contents.files) {
            const unzippedFile = await contents.files[filename].async('blob');
            await processFile(new File([unzippedFile], filename));
          }
        } else {
          await processFile(file);
        }
      }
    }
  };

  const filterGames = (games: Array<{id: string, name: string}>) => {
    if (!filterString.trim()) return games;

    const filters = filterString.split(',').map(f => f.trim().toLowerCase());
    return games.filter(game =>
      filters.some(filter => game.id.toLowerCase().includes(filter))
    );
  };

  useEffect(() => {
    const processData = () => {
      try {
        const { cms, contentHub, upam } = gameData;

        if (!cms.length && !contentHub.length && !upam.length) {
          return;
        }

        // Filter active games with their IDs
        const activeInCMS = cms.filter(g => !g.isHidden).map(g => ({ id: g.gameId, name: g.name }));
        const activeInContentHub = contentHub.filter(g => g.isActive).map(g => ({ id: g.gameID, name: g.name }));
        const activeInUPAM = upam.filter(g => g.enabled).map(g => ({ id: g.externalGameId, name: g.name }));

        // Create sets for quick lookup
        const cmsSet = new Set(activeInCMS.map(g => g.id));
        const contentHubSet = new Set(activeInContentHub.map(g => g.id));
        const upamSet = new Set(activeInUPAM.map(g => g.id));

        // Calculate game categories
        const allThreeGames = activeInCMS.filter(g =>
          contentHubSet.has(g.id) && upamSet.has(g.id)
        );

        const cmsOnlyGames = activeInCMS.filter(g =>
          !contentHubSet.has(g.id) && !upamSet.has(g.id)
        );

        const contentHubOnlyGames = activeInContentHub.filter(g =>
          !cmsSet.has(g.id) && !upamSet.has(g.id)
        );

        const upamOnlyGames = activeInUPAM.filter(g =>
          !cmsSet.has(g.id) && !contentHubSet.has(g.id)
        );

        const cmsAndContentHubGames = activeInCMS.filter(g =>
          contentHubSet.has(g.id) && !upamSet.has(g.id)
        );

        const cmsAndUpamGames = activeInCMS.filter(g =>
          !contentHubSet.has(g.id) && upamSet.has(g.id)
        );

        const contentHubAndUpamGames = activeInContentHub.filter(g =>
          !cmsSet.has(g.id) && upamSet.has(g.id)
        );

        const filteredCategories = {
          allThree: filterGames(allThreeGames),
          cmsOnly: filterGames(cmsOnlyGames),
          contentHubOnly: filterGames(contentHubOnlyGames),
          upamOnly: filterGames(upamOnlyGames),
          cmsAndContentHub: filterGames(cmsAndContentHubGames),
          cmsAndUpam: filterGames(cmsAndUpamGames),
          contentHubAndUpam: filterGames(contentHubAndUpamGames)
        };

        setGameCategories(filteredCategories);

        setSummary({
          allThree: filteredCategories.allThree.length,
          cmsOnly: filteredCategories.cmsOnly.length,
          contentHubOnly: filteredCategories.contentHubOnly.length,
          upamOnly: filteredCategories.upamOnly.length,
          cmsAndContentHub: filteredCategories.cmsAndContentHub.length,
          cmsAndUpam: filteredCategories.cmsAndUpam.length,
          contentHubAndUpam: filteredCategories.contentHubAndUpam.length,
          total: Object.values(filteredCategories).reduce((acc, curr) => acc + curr.length, 0)
        });
      } catch (error) {
        console.error('Error processing data:', error);
      }
    };

    processData();
  }, [gameData, filterString]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const renderGameList = (games: Array<{id: string, name: string}>) => {
    return (
      <div className="pl-6 py-2 text-sm text-gray-600">
        {games.map(game => (
          <div key={game.id} className="py-1">
            <span className="font-medium">{game.id}</span>
            {game.name && <span className="ml-2 text-gray-500">({game.name})</span>}
          </div>
        ))}
      </div>
    );
  };

  const vennData = [
    { sets: ['CMS'], size: summary.cmsOnly, games: gameCategories.cmsOnly },
    { sets: ['Content Hub'], size: summary.contentHubOnly, games: gameCategories.contentHubOnly },
    { sets: ['UPAM'], size: summary.upamOnly, games: gameCategories.upamOnly },
    { sets: ['CMS', 'Content Hub'], size: summary.cmsAndContentHub, games: gameCategories.cmsAndContentHub },
    { sets: ['CMS', 'UPAM'], size: summary.cmsAndUpam, games: gameCategories.cmsAndUpam },
    { sets: ['Content Hub', 'UPAM'], size: summary.contentHubAndUpam, games: gameCategories.contentHubAndUpam },
    { sets: ['CMS', 'Content Hub', 'UPAM'], size: summary.allThree, games: gameCategories.allThree }
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">{environment} IWG Analysis</h1>

        <div
          className="bg-white rounded-lg shadow-md p-6 mb-8 border-2 border-dashed border-gray-300"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Drag and drop your JSON files or a single zip file here
              </p>
              <p className="mt-1 text-xs text-gray-500">or</p>
              <input
                type="file"
                multiple
                accept=".json,.zip"
                onChange={handleFileInput}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer mt-2 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Browse files
              </label>
              <div className="mt-4 flex gap-2 justify-center text-sm">
                <span className={`px-2 py-1 rounded ${uploadedFiles.cms ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  CMS {uploadedFiles.cms ? '✓' : ''}
                </span>
                <span className={`px-2 py-1 rounded ${uploadedFiles.contentHub ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  Content Hub {uploadedFiles.contentHub ? '✓' : ''}
                </span>
                <span className={`px-2 py-1 rounded ${uploadedFiles.upam ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  UPAM {uploadedFiles.upam ? '✓' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        {(uploadedFiles.cms || uploadedFiles.contentHub || uploadedFiles.upam) && (
          <>
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Summary Table</h2>
                <div className="relative flex items-center">
                  <Search className="absolute left-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Filter by game ID (comma-separated)"
                    value={filterString}
                    onChange={(e) => setFilterString(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-80"
                  />
                </div>
              </div>
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {[
                    { label: 'Present in All Systems', key: 'allThree', games: gameCategories.allThree },
                    { label: 'CMS Only', key: 'cmsOnly', games: gameCategories.cmsOnly },
                    { label: 'Content Hub Only', key: 'contentHubOnly', games: gameCategories.contentHubOnly },
                    { label: 'UPAM Only', key: 'upamOnly', games: gameCategories.upamOnly },
                    { label: 'CMS & Content Hub', key: 'cmsAndContentHub', games: gameCategories.cmsAndContentHub },
                    { label: 'CMS & UPAM', key: 'cmsAndUpam', games: gameCategories.cmsAndUpam },
                    { label: 'Content Hub & UPAM', key: 'contentHubAndUpam', games: gameCategories.contentHubAndUpam }
                  ].map(({ label, key, games }) => (
                    <React.Fragment key={key}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleCategory(key)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap flex items-center">
                          {expandedCategories[key] ? (
                            <ChevronDown className="w-4 h-4 mr-2" />
                          ) : (
                            <ChevronRight className="w-4 h-4 mr-2" />
                          )}
                          {label}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{games.length}</td>
                      </tr>
                      {expandedCategories[key] && (
                        <tr>
                          <td colSpan={2}>
                            {renderGameList(games)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium">Total Games</td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">{summary.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Venn Diagram</h2>
              <div className="w-full h-[600px]">
                <VennDiagram data={vennData} />
              </div>
              <p className="text-sm text-gray-500 text-center mt-4">
                Click on any number in the Venn diagram to see the list of games in that category
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
