import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  Search,
  Calendar,
  Filter,
  Eye,
  Trash2
} from 'lucide-react';
import axios from 'axios';
import { API } from '../App';
import { toast } from 'sonner';

function DocumentationViewer() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [filteredDocuments, setFilteredDocuments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocumentation();
  }, []);

  useEffect(() => {
    // Filter documents based on search term
    const filtered = documents.filter(doc =>
      doc.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.template_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredDocuments(filtered);
  }, [documents, searchTerm]);

  const loadDocumentation = async () => {
    try {
      setLoading(true);
      // For now, we'll use mock data since we don't have a get all documentation endpoint
      // In a real implementation, you'd fetch from an API endpoint
      const mockDocuments = [
        {
          id: '1',
          device_name: 'Switch-01',
          device_ip: '192.168.1.100',
          device_type: 'arista_eos',
          template_name: 'default',
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          commands_count: 5
        },
        {
          id: '2',
          device_name: 'Router-01',
          device_ip: '192.168.1.1',
          device_type: 'cisco_ios',
          template_name: 'default',
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          commands_count: 3
        }
      ];
      
      setDocuments(mockDocuments);
    } catch (error) {
      console.error('Error loading documentation:', error);
      toast.error('Failed to load documentation');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocument = async (docId, deviceName) => {
    try {
      const response = await axios.get(`${API}/documentation/${docId}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deviceName}_documentation.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Documentation downloaded successfully');
    } catch (error) {
      console.error('Error downloading documentation:', error);
      toast.error('Failed to download documentation');
    }
  };

  const handleDeleteDocument = async (docId, deviceName) => {
    if (!window.confirm(`Are you sure you want to delete the documentation for ${deviceName}?`)) {
      return;
    }

    try {
      // In a real implementation, you'd have a delete endpoint
      // await axios.delete(`${API}/documentation/${docId}`);
      
      setDocuments(documents.filter(doc => doc.id !== docId));
      toast.success('Documentation deleted successfully');
    } catch (error) {
      console.error('Error deleting documentation:', error);
      toast.error('Failed to delete documentation');
    }
  };

  const getDeviceTypeColor = (deviceType) => {
    switch (deviceType?.toLowerCase()) {
      case 'arista_eos':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'cisco_ios':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'cisco_xe':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diff = now - date;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading documentation...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold gradient-text">Documentation Library</h1>
              <p className="text-slate-600">Browse and manage generated network documentation</p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="glass-card mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search by device name or template..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                Filter
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Documentation List */}
        {filteredDocuments.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-400" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                {documents.length === 0 ? 'No Documentation Generated' : 'No Results Found'}
              </h3>
              <p className="text-slate-600 mb-6">
                {documents.length === 0 
                  ? 'Execute commands on your devices to generate documentation'
                  : 'Try adjusting your search criteria'
                }
              </p>
              {documents.length === 0 && (
                <Button 
                  onClick={() => navigate('/devices')}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Documentation
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDocuments.map((doc) => (
              <Card key={doc.id} className="device-card">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        {doc.device_name}
                      </CardTitle>
                      <CardDescription className="font-mono text-sm">
                        {doc.device_ip}
                      </CardDescription>
                    </div>
                    <Badge className={getDeviceTypeColor(doc.device_type)}>
                      {doc.device_type?.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Template:</span>
                        <Badge variant="outline" className="text-xs">
                          {doc.template_name}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Commands:</span>
                        <span className="font-semibold">{doc.commands_count}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Generated:</span>
                        <span className="text-slate-500 text-xs">
                          {getTimeAgo(doc.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-xs text-slate-500 mb-3">
                        {formatDate(doc.created_at)}
                      </p>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleDownloadDocument(doc.id, doc.device_name)}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id, doc.device_name)}
                          className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Statistics */}
        {documents.length > 0 && (
          <Card className="glass-card mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Documentation Statistics
              </CardTitle>
              <CardDescription>Overview of your documentation library</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">{documents.length}</div>
                  <div className="text-sm text-blue-600">Total Documents</div>
                </div>
                
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">
                    {new Set(documents.map(d => d.device_name)).size}
                  </div>
                  <div className="text-sm text-green-600">Unique Devices</div>
                </div>
                
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-700">
                    {documents.reduce((sum, doc) => sum + doc.commands_count, 0)}
                  </div>
                  <div className="text-sm text-purple-600">Total Commands</div>
                </div>
                
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-700">
                    {new Set(documents.map(d => d.template_name)).size}
                  </div>
                  <div className="text-sm text-orange-600">Templates Used</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default DocumentationViewer;