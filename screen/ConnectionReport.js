import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  Image,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import api from '../services/api';

export default function ConnectionReport({navigation}) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReport() {
      try {
        const data = await api.get('/sessions/last-report');
        setReport(data);
      } catch (err) {
        console.error('Failed to fetch report:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, []);

  const formatData = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? '0' + v : v).join(':');
  };
  return (
    <ScrollView style={{ backgroundColor: '#00091F' }}>
      <View style={{ flexGrow: 1, paddingBottom: 50 }}>
        <View style={{ height: 20 }} />
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '90%',
          alignSelf: 'center',
          height: 40,
        }}>
          <Pressable onPress={() => navigation.goBack()}>
            <View style={{
              alignItems: 'center',
              width: 40,
              height: 40,
              justifyContent: 'center',
              borderRadius: 12,
              backgroundColor: '#171B2E',
            }}>
              <Image source={require('../assets/Left.png')} style={{ width: 24, height: 24 }} />
            </View>
          </Pressable>

          <Text style={{ fontSize: 20, fontWeight: '300', color: '#fff' }}>Connection Report</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={{ height: Dimensions.get('window').height - 150, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#6B8F04" />
            <Text style={{ color: '#A1A1AC', marginTop: 15 }}>Fetching session summary...</Text>
          </View>
        ) : (
          <>
            <View style={{ height: 20 }} />
            <Image
              source={require('../assets/Connection.png')}
              style={{ width: 64, alignSelf: 'center', height: 64 }}
            />
            <View style={{ height: 10 }} />
            <Text style={{
              fontSize: 14,
              fontWeight: '400',
              color: '#fff',
              textAlign: 'center',
              paddingHorizontal: '10%',
            }}>
              This is a summary of information from using FastVPN while connected
            </Text>
          </>
        )}

         
<View

style={{
    width:"90%", alignSelf:"center"
}}
>
<View style={{height: 10}} />


<View
                  style={{
                    width: '100%',
                    height: 88,
                    backgroundColor: 'rgba(46, 46, 61, 0.5)',
                    borderWidth: 1,
                    borderColor: '#202023',
                    marginTop: 20,
                    borderRadius: 20,
                    padding: 12,
                  }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        // justifyContent:"space-between",
                        alignItems: 'center',
                      }}>
                      <View
                        style={{
                          height: 64,
                          width: 64,
                          borderRadius: 12,
                          backgroundColor: '#00091F',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <Image
                          source={require('../assets/Loc.png')}
                          style={{
                            width: 32,
                            height: 32,
                          }}
                        />
                      </View>
                      <View
                        style={{
                          justifyContent: 'center',
                          marginLeft: 10,
                        }}>
                             <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '100',
                            color: '#A1A1AC',
                            marginTop: 4,
                          }}>
                          Location
                        </Text>
                        <View style={{height: 5}} />


                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: '400',
                            color: '#fff',
                          }}>
                          {report?.location || 'Unknown Location'}
                        </Text>

                       
                      </View>
                    </View>
                    
                  </View>
                </View>
                {/* <View style={{height: 10}} /> */}


<View
                  style={{
                    width: '100%',
                    height: 88,
                    backgroundColor: 'rgba(46, 46, 61, 0.5)',
                    borderWidth: 1,
                    borderColor: '#202023',
                    marginTop: 20,
                    borderRadius: 20,
                    padding: 12,
                  }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        // justifyContent:"space-between",
                        alignItems: 'center',
                      }}>
                      <View
                        style={{
                          height: 64,
                          width: 64,
                          borderRadius: 12,
                          backgroundColor: '#00091F',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <Image
                          source={require('../assets/Ip.png')}
                          style={{
                            width: 32,
                            height: 32,
                          }}
                        />
                      </View>
                      <View
                        style={{
                          justifyContent: 'center',
                          marginLeft: 10,
                        }}>
                             <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '100',
                            color: '#A1A1AC',
                            marginTop: 4,
                          }}>
                          IP Address
                        </Text>
                        <View style={{height: 5}} />


                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: '400',
                            color: '#fff',
                          }}>
                          {report?.assigned_vpn_ip || '0.0.0.0'}
                        </Text>

                       
                      </View>
                    </View>
                    
                  </View>
                </View>
                {/* <View style={{height: 10}} /> */}


<View
                  style={{
                    width: '100%',
                    height: 88,
                    backgroundColor: 'rgba(46, 46, 61, 0.5)',
                    borderWidth: 1,
                    borderColor: '#202023',
                    marginTop: 20,
                    borderRadius: 20,
                    padding: 12,
                  }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        // justifyContent:"space-between",
                        alignItems: 'center',
                      }}>
                      <View
                        style={{
                          height: 64,
                          width: 64,
                          borderRadius: 12,
                          backgroundColor: '#00091F',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <Image
                          source={require('../assets/Du.png')}
                          style={{
                            width: 32,
                            height: 32,
                          }}
                        />
                      </View>
                      <View
                        style={{
                          justifyContent: 'center',
                          marginLeft: 10,
                        }}>
                             <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '100',
                            color: '#A1A1AC',
                            marginTop: 4,
                          }}>
                          Duration
                        </Text>
                        <View style={{height: 5}} />


                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: '400',
                            color: '#fff',
                          }}>
                         {formatDuration(report?.duration_seconds)}
                        </Text>

                       
                      </View>
                    </View>
                    
                  </View>
                </View>
                {/* <View style={{height: 10}} /> */}


<View
                  style={{
                    width: '100%',
                    height: 88,
                    backgroundColor: 'rgba(46, 46, 61, 0.5)',
                    borderWidth: 1,
                    borderColor: '#202023',
                    marginTop: 20,
                    borderRadius: 20,
                    padding: 12,
                  }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        // justifyContent:"space-between",
                        alignItems: 'center',
                      }}>
                      <View
                        style={{
                          height: 64,
                          width: 64,
                          borderRadius: 12,
                          backgroundColor: '#00091F',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <Image
                          source={require('../assets/Da.png')}
                          style={{
                            width: 32,
                            height: 32,
                          }}
                        />
                      </View>
                      <View
                        style={{
                          justifyContent: 'center',
                          marginLeft: 10,
                        }}>
                             <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '100',
                            color: '#A1A1AC',
                            marginTop: 4,
                          }}>
                          Data Used
                        </Text>
                        <View style={{height: 5}} />


                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: '400',
                            color: '#fff',
                          }}>
                        {formatData(Number(report?.bytes_sent || 0) + Number(report?.bytes_received || 0))}
                        </Text>

                       
                      </View>
                    </View>
                    
                  </View>
                </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mainBg: {
    backgroundColor: '#00091F',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    alignSelf: 'center',
    width: '90%',

    backgroundColor: '#171B2E',
    borderRadius: 8,
    paddingLeft: 16,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
  },
  tabBarContainer: {
    flexDirection: 'row',
    marginTop: 20,
    // backgroundColor: '#171B2E',
    height: 56,
    marginLeft: 20,
  },
  tab: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
    borderWidth: 1,
    borderRadius: 12,
  },
  tabText: {
    color: '#FFFFFF',
  },
});
